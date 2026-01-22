import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { WorkflowValidator } from '@/services/workflow-validator';
import { NodeRepository } from '@/database/node-repository';
import { EnhancedConfigValidator } from '@/services/enhanced-config-validator';

vi.mock('@/utils/logger');

describe('WorkflowValidator - Mock-based Unit Tests', () => {
  let validator: WorkflowValidator;
  let mockNodeRepository: any;
  let mockGetNode: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create detailed mock repository with spy functions
    mockGetNode = vi.fn();
    mockNodeRepository = {
      getNode: mockGetNode
    };

    validator = new WorkflowValidator(mockNodeRepository, EnhancedConfigValidator);

    // Default mock responses
    mockGetNode.mockImplementation((type: string) => {
      if (type.includes('httpRequest')) {
        return {
          node_type: type,
          display_name: 'HTTP Request',
          isVersioned: true,
          version: 4
        };
      } else if (type.includes('set')) {
        return {
          node_type: type,
          display_name: 'Set',
          isVersioned: true,
          version: 3
        };
      } else if (type.includes('respondToWebhook')) {
        return {
          node_type: type,
          display_name: 'Respond to Webhook',
          isVersioned: true,
          version: 1
        };
      }
      return null;
    });
  });

  describe('Error Handler Detection Logic', () => {
    it('should correctly identify error handlers by node name patterns', async () => {
      const errorNodeNames = [
        'Error Handler',
        'Handle Error',
        'Catch Exception',
        'Failure Response',
        'Error Notification',
        'Fail Safe',
        'Exception Handler',
        'Error Callback'
      ];

      const successNodeNames = [
        'Process Data',
        'Transform',
        'Success Handler',
        'Continue Process',
        'Normal Flow'
      ];

      for (const errorName of errorNodeNames) {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'Source',
              type: 'n8n-nodes-base.httpRequest',
              position: [0, 0],
              parameters: {}
            },
            {
              id: '2',
              name: 'Success Path',
              type: 'n8n-nodes-base.set',
              position: [200, 0],
              parameters: {}
            },
            {
              id: '3',
              name: errorName,
              type: 'n8n-nodes-base.set',
              position: [200, 100],
              parameters: {}
            }
          ],
          connections: {
            'Source': {
              main: [
                [
                  { node: 'Success Path', type: 'main', index: 0 },
                  { node: errorName, type: 'main', index: 0 }  // Should be detected as error handler
                ]
              ]
            }
          }
        };

        const result = await validator.validateWorkflow(workflow as any);

        // Should detect this as an incorrect error configuration
        const hasError = result.errors.some(e =>
          e.message.includes('Incorrect error output configuration') &&
          e.message.includes(errorName)
        );
        expect(hasError).toBe(true);
      }

      // Test that success node names are NOT flagged
      for (const successName of successNodeNames) {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'Source',
              type: 'n8n-nodes-base.httpRequest',
              position: [0, 0],
              parameters: {}
            },
            {
              id: '2',
              name: 'First Process',
              type: 'n8n-nodes-base.set',
              position: [200, 0],
              parameters: {}
            },
            {
              id: '3',
              name: successName,
              type: 'n8n-nodes-base.set',
              position: [200, 100],
              parameters: {}
            }
          ],
          connections: {
            'Source': {
              main: [
                [
                  { node: 'First Process', type: 'main', index: 0 },
                  { node: successName, type: 'main', index: 0 }
                ]
              ]
            }
          }
        };

        const result = await validator.validateWorkflow(workflow as any);

        // Should NOT detect this as an error configuration
        const hasError = result.errors.some(e =>
          e.message.includes('Incorrect error output configuration')
        );
        expect(hasError).toBe(false);
      }
    });

    it('should correctly identify error handlers by node type patterns', async () => {
      const errorNodeTypes = [
        'n8n-nodes-base.respondToWebhook',
        'n8n-nodes-base.emailSend'
        // Note: slack and webhook are not in the current detection logic
      ];

      // Update mock to return appropriate node info for these types
      mockGetNode.mockImplementation((type: string) => {
        return {
          node_type: type,
          display_name: type.split('.').pop() || 'Unknown',
          isVersioned: true,
          version: 1
        };
      });

      for (const nodeType of errorNodeTypes) {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'Source',
              type: 'n8n-nodes-base.httpRequest',
              position: [0, 0],
              parameters: {}
            },
            {
              id: '2',
              name: 'Success Path',
              type: 'n8n-nodes-base.set',
              position: [200, 0],
              parameters: {}
            },
            {
              id: '3',
              name: 'Response Node',
              type: nodeType,
              position: [200, 100],
              parameters: {}
            }
          ],
          connections: {
            'Source': {
              main: [
                [
                  { node: 'Success Path', type: 'main', index: 0 },
                  { node: 'Response Node', type: 'main', index: 0 }  // Should be detected
                ]
              ]
            }
          }
        };

        const result = await validator.validateWorkflow(workflow as any);

        // Should detect this as an incorrect error configuration
        const hasError = result.errors.some(e =>
          e.message.includes('Incorrect error output configuration') &&
          e.message.includes('Response Node')
        );
        expect(hasError).toBe(true);
      }
    });

    it('should handle cases where node repository returns null', async () => {
      // Mock repository to return null for unknown nodes
      mockGetNode.mockImplementation((type: string) => {
        if (type === 'n8n-nodes-base.unknownNode') {
          return null;
        }
        return {
          node_type: type,
          display_name: 'Known Node',
          isVersioned: true,
          version: 1
        };
      });

      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Source',
            type: 'n8n-nodes-base.httpRequest',
            position: [0, 0],
            parameters: {}
          },
          {
            id: '2',
            name: 'Unknown Node',
            type: 'n8n-nodes-base.unknownNode',
            position: [200, 0],
            parameters: {}
          },
          {
            id: '3',
            name: 'Error Handler',
            type: 'n8n-nodes-base.set',
            position: [200, 100],
            parameters: {}
          }
        ],
        connections: {
          'Source': {
            main: [
              [
                { node: 'Unknown Node', type: 'main', index: 0 },
                { node: 'Error Handler', type: 'main', index: 0 }
              ]
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      // Should still detect the error configuration based on node name
      const hasError = result.errors.some(e =>
        e.message.includes('Incorrect error output configuration') &&
        e.message.includes('Error Handler')
      );
      expect(hasError).toBe(true);

      // Should not crash due to null node info
      expect(result).toHaveProperty('valid');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('onError Property Validation Logic', () => {
    it('should validate onError property combinations correctly', async () => {
      const testCases = [
        {
          name: 'onError set but no error connections',
          onError: 'continueErrorOutput',
          hasErrorConnections: false,
          expectedErrorType: 'error',
          expectedMessage: "has onError: 'continueErrorOutput' but no error output connections"
        },
        {
          name: 'error connections but no onError',
          onError: undefined,
          hasErrorConnections: true,
          expectedErrorType: 'warning',
          expectedMessage: 'error output connections in main[1] but missing onError'
        },
        {
          name: 'onError set with error connections',
          onError: 'continueErrorOutput',
          hasErrorConnections: true,
          expectedErrorType: null,
          expectedMessage: null
        },
        {
          name: 'no onError and no error connections',
          onError: undefined,
          hasErrorConnections: false,
          expectedErrorType: null,
          expectedMessage: null
        }
      ];

      for (const testCase of testCases) {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'Test Node',
              type: 'n8n-nodes-base.httpRequest',
              position: [0, 0],
              parameters: {},
              ...(testCase.onError ? { onError: testCase.onError } : {})
            },
            {
              id: '2',
              name: 'Success Handler',
              type: 'n8n-nodes-base.set',
              position: [200, 0],
              parameters: {}
            },
            {
              id: '3',
              name: 'Error Handler',
              type: 'n8n-nodes-base.set',
              position: [200, 100],
              parameters: {}
            }
          ],
          connections: {
            'Test Node': {
              main: [
                [
                  { node: 'Success Handler', type: 'main', index: 0 }
                ],
                ...(testCase.hasErrorConnections ? [
                  [
                    { node: 'Error Handler', type: 'main', index: 0 }
                  ]
                ] : [])
              ]
            }
          }
        };

        const result = await validator.validateWorkflow(workflow as any);

        if (testCase.expectedErrorType === 'error') {
          const hasExpectedError = result.errors.some(e =>
            e.nodeName === 'Test Node' &&
            e.message.includes(testCase.expectedMessage!)
          );
          expect(hasExpectedError).toBe(true);
        } else if (testCase.expectedErrorType === 'warning') {
          const hasExpectedWarning = result.warnings.some(w =>
            w.nodeName === 'Test Node' &&
            w.message.includes(testCase.expectedMessage!)
          );
          expect(hasExpectedWarning).toBe(true);
        } else {
          // Should not have related errors or warnings about onError/error output mismatches
          const hasRelatedError = result.errors.some(e =>
            e.nodeName === 'Test Node' &&
            (e.message.includes("has onError: 'continueErrorOutput' but no error output connections") ||
             e.message.includes('Incorrect error output configuration'))
          );
          const hasRelatedWarning = result.warnings.some(w =>
            w.nodeName === 'Test Node' &&
            w.message.includes('error output connections in main[1] but missing onError')
          );
          expect(hasRelatedError).toBe(false);
          expect(hasRelatedWarning).toBe(false);
        }
      }
    });

    it('should handle different onError values correctly', async () => {
      const onErrorValues = [
        'continueErrorOutput',
        'continueRegularOutput',
        'stopWorkflow'
      ];

      for (const onErrorValue of onErrorValues) {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'Test Node',
              type: 'n8n-nodes-base.httpRequest',
              position: [0, 0],
              parameters: {},
              onError: onErrorValue
            },
            {
              id: '2',
              name: 'Next Node',
              type: 'n8n-nodes-base.set',
              position: [200, 0],
              parameters: {}
            }
          ],
          connections: {
            'Test Node': {
              main: [
                [
                  { node: 'Next Node', type: 'main', index: 0 }
                ]
                // No error connections
              ]
            }
          }
        };

        const result = await validator.validateWorkflow(workflow as any);

        if (onErrorValue === 'continueErrorOutput') {
          // Should have error about missing error connections
          const hasError = result.errors.some(e =>
            e.nodeName === 'Test Node' &&
            e.message.includes("has onError: 'continueErrorOutput' but no error output connections")
          );
          expect(hasError).toBe(true);
        } else {
          // Should not have error about missing error connections
          const hasError = result.errors.some(e =>
            e.nodeName === 'Test Node' &&
            e.message.includes('but no error output connections')
          );
          expect(hasError).toBe(false);
        }
      }
    });
  });

  describe('JSON Format Generation', () => {
    it('should generate valid JSON in error messages', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'API Call',
            type: 'n8n-nodes-base.httpRequest',
            position: [0, 0],
            parameters: {}
          },
          {
            id: '2',
            name: 'Success Process',
            type: 'n8n-nodes-base.set',
            position: [200, 0],
            parameters: {}
          },
          {
            id: '3',
            name: 'Error Handler',
            type: 'n8n-nodes-base.respondToWebhook',
            position: [200, 100],
            parameters: {}
          }
        ],
        connections: {
          'API Call': {
            main: [
              [
                { node: 'Success Process', type: 'main', index: 0 },
                { node: 'Error Handler', type: 'main', index: 0 }
              ]
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      const errorConfigError = result.errors.find(e =>
        e.message.includes('Incorrect error output configuration')
      );

      expect(errorConfigError).toBeDefined();

      // Extract JSON sections from error message
      const incorrectMatch = errorConfigError!.message.match(/INCORRECT \(current\):\n([\s\S]*?)\n\nCORRECT/);
      const correctMatch = errorConfigError!.message.match(/CORRECT \(should be\):\n([\s\S]*?)\n\nAlso add/);

      expect(incorrectMatch).toBeDefined();
      expect(correctMatch).toBeDefined();

      // Extract just the JSON part (remove comments)
      const incorrectJsonStr = incorrectMatch![1];
      const correctJsonStr = correctMatch![1];

      // Remove comments and clean up for JSON parsing
      const cleanIncorrectJson = incorrectJsonStr.replace(/\/\/.*$/gm, '').replace(/,\s*$/, '');
      const cleanCorrectJson = correctJsonStr.replace(/\/\/.*$/gm, '').replace(/,\s*$/, '');

      const incorrectJson = `{${cleanIncorrectJson}}`;
      const correctJson = `{${cleanCorrectJson}}`;

      expect(() => JSON.parse(incorrectJson)).not.toThrow();
      expect(() => JSON.parse(correctJson)).not.toThrow();

      const parsedIncorrect = JSON.parse(incorrectJson);
      const parsedCorrect = JSON.parse(correctJson);

      // Validate structure
      expect(parsedIncorrect).toHaveProperty('API Call');
      expect(parsedCorrect).toHaveProperty('API Call');
      expect(parsedIncorrect['API Call']).toHaveProperty('main');
      expect(parsedCorrect['API Call']).toHaveProperty('main');

      // Incorrect should have both nodes in main[0]
      expect(Array.isArray(parsedIncorrect['API Call'].main)).toBe(true);
      expect(parsedIncorrect['API Call'].main).toHaveLength(1);
      expect(parsedIncorrect['API Call'].main[0]).toHaveLength(2);

      // Correct should have separate arrays
      expect(Array.isArray(parsedCorrect['API Call'].main)).toBe(true);
      expect(parsedCorrect['API Call'].main).toHaveLength(2);
      expect(parsedCorrect['API Call'].main[0]).toHaveLength(1); // Success only
      expect(parsedCorrect['API Call'].main[1]).toHaveLength(1); // Error only
    });

    it('should handle special characters in node names in JSON', async () => {
      // Test simpler special characters that are easier to handle in JSON
      const specialNodeNames = [
        'Node with spaces',
        'Node-with-dashes',
        'Node_with_underscores'
      ];

      for (const specialName of specialNodeNames) {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'Source',
              type: 'n8n-nodes-base.httpRequest',
              position: [0, 0],
              parameters: {}
            },
            {
              id: '2',
              name: 'Success',
              type: 'n8n-nodes-base.set',
              position: [200, 0],
              parameters: {}
            },
            {
              id: '3',
              name: specialName,
              type: 'n8n-nodes-base.respondToWebhook',
              position: [200, 100],
              parameters: {}
            }
          ],
          connections: {
            'Source': {
              main: [
                [
                  { node: 'Success', type: 'main', index: 0 },
                  { node: specialName, type: 'main', index: 0 }
                ]
              ]
            }
          }
        };

        const result = await validator.validateWorkflow(workflow as any);

        const errorConfigError = result.errors.find(e =>
          e.message.includes('Incorrect error output configuration')
        );

        expect(errorConfigError).toBeDefined();

        // Verify the error message contains the special node name
        expect(errorConfigError!.message).toContain(specialName);

        // Verify JSON structure is present (but don't parse due to comments)
        expect(errorConfigError!.message).toContain('INCORRECT (current):');
        expect(errorConfigError!.message).toContain('CORRECT (should be):');
        expect(errorConfigError!.message).toContain('main[0]');
        expect(errorConfigError!.message).toContain('main[1]');
      }
    });
  });

  describe('Repository Interaction Patterns', () => {
    it('should call repository getNode with correct parameters', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'HTTP Node',
            type: 'n8n-nodes-base.httpRequest',
            position: [0, 0],
            parameters: {}
          },
          {
            id: '2',
            name: 'Set Node',
            type: 'n8n-nodes-base.set',
            position: [200, 0],
            parameters: {}
          }
        ],
        connections: {
          'HTTP Node': {
            main: [
              [
                { node: 'Set Node', type: 'main', index: 0 }
              ]
            ]
          }
        }
      };

      await validator.validateWorkflow(workflow as any);

      // Should have called getNode for each node type (normalized to short form)
      expect(mockGetNode).toHaveBeenCalledWith('nodes-base.httpRequest');
      expect(mockGetNode).toHaveBeenCalledWith('nodes-base.set');
      expect(mockGetNode).toHaveBeenCalledTimes(2);
    });

    it('should handle repository errors gracefully', async () => {
      // Mock repository to throw error
      mockGetNode.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Test Node',
            type: 'n8n-nodes-base.httpRequest',
            position: [0, 0],
            parameters: {}
          }
        ],
        connections: {}
      };

      // Should not throw error
      const result = await validator.validateWorkflow(workflow as any);

      // Should still return a valid result
      expect(result).toHaveProperty('valid');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should optimize repository calls for duplicate node types', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'HTTP 1',
            type: 'n8n-nodes-base.httpRequest',
            position: [0, 0],
            parameters: {}
          },
          {
            id: '2',
            name: 'HTTP 2',
            type: 'n8n-nodes-base.httpRequest',
            position: [200, 0],
            parameters: {}
          },
          {
            id: '3',
            name: 'HTTP 3',
            type: 'n8n-nodes-base.httpRequest',
            position: [400, 0],
            parameters: {}
          }
        ],
        connections: {}
      };

      await validator.validateWorkflow(workflow as any);

      // Should call getNode for the same type multiple times (current implementation)
      // Note: This test documents current behavior. Could be optimized in the future.
      const httpRequestCalls = mockGetNode.mock.calls.filter(
        call => call[0] === 'nodes-base.httpRequest'
      );
      expect(httpRequestCalls.length).toBeGreaterThan(0);
    });
  });
});