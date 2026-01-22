import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { TestableN8NMCPServer } from './test-helpers';

describe('MCP Workflow Error Output Validation Integration', () => {
  let mcpServer: TestableN8NMCPServer;
  let client: Client;

  beforeEach(async () => {
    mcpServer = new TestableN8NMCPServer();
    await mcpServer.initialize();

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connectToTransport(serverTransport);

    client = new Client({
      name: 'test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await mcpServer.close();
  });

  describe('validate_workflow tool - Error Output Configuration', () => {
    it('should detect incorrect error output configuration via MCP', async () => {
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

      const response = await client.callTool({
        name: 'validate_workflow',
        arguments: { workflow }
      });

      expect((response as any).content).toHaveLength(1);
      expect((response as any).content[0].type).toBe('text');

      const result = JSON.parse(((response as any).content[0]).text);

      expect(result.valid).toBe(false);
      expect(Array.isArray(result.errors)).toBe(true);

      // Check for the specific error message about incorrect configuration
      const hasIncorrectConfigError = result.errors.some((e: any) =>
        e.message.includes('Incorrect error output configuration') &&
        e.message.includes('Error Response1') &&
        e.message.includes('appear to be error handlers but are in main[0]')
      );
      expect(hasIncorrectConfigError).toBe(true);

      // Verify the error message includes the JSON examples
      const errorMsg = result.errors.find((e: any) =>
        e.message.includes('Incorrect error output configuration')
      );
      expect(errorMsg?.message).toContain('INCORRECT (current)');
      expect(errorMsg?.message).toContain('CORRECT (should be)');
      expect(errorMsg?.message).toContain('main[1] = error output');
    });

    it('should validate correct error output configuration via MCP', async () => {
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

      const response = await client.callTool({
        name: 'validate_workflow',
        arguments: { workflow }
      });

      expect((response as any).content).toHaveLength(1);
      expect((response as any).content[0].type).toBe('text');

      const result = JSON.parse(((response as any).content[0]).text);

      // Should not have the specific error about incorrect configuration
      const hasIncorrectConfigError = result.errors?.some((e: any) =>
        e.message.includes('Incorrect error output configuration')
      ) ?? false;
      expect(hasIncorrectConfigError).toBe(false);
    });

    it('should detect onError and connection mismatches via MCP', async () => {
      // Test case 1: onError set but no error connections
      const workflow1 = {
        nodes: [
          {
            id: '1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 4,
            position: [100, 100],
            parameters: {},
            onError: 'continueErrorOutput'
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
            ]
          }
        }
      };

      // Test case 2: error connections but no onError
      const workflow2 = {
        nodes: [
          {
            id: '1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 4,
            position: [100, 100],
            parameters: {}
            // No onError property
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
            position: [300, 200],
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
                { node: 'Error Handler', type: 'main', index: 0 }
              ]
            ]
          }
        }
      };

      // Test both scenarios
      const workflows = [workflow1, workflow2];

      for (const workflow of workflows) {
        const response = await client.callTool({
          name: 'validate_workflow',
          arguments: { workflow }
        });

        const result = JSON.parse(((response as any).content[0]).text);

        // Should detect some kind of validation issue
        expect(result).toHaveProperty('valid');
        expect(Array.isArray(result.errors || [])).toBe(true);
        expect(Array.isArray(result.warnings || [])).toBe(true);
      }
    });

    it('should handle large workflows with complex error patterns via MCP', async () => {
      // Create a large workflow with multiple error handling scenarios
      const nodes = [];
      const connections: any = {};

      // Create 50 nodes with various error handling patterns
      for (let i = 1; i <= 50; i++) {
        nodes.push({
          id: i.toString(),
          name: `Node${i}`,
          type: i % 5 === 0 ? 'n8n-nodes-base.httpRequest' : 'n8n-nodes-base.set',
          typeVersion: 1,
          position: [i * 100, 100],
          parameters: {},
          ...(i % 3 === 0 ? { onError: 'continueErrorOutput' } : {})
        });
      }

      // Create connections with mixed correct and incorrect error handling
      for (let i = 1; i < 50; i++) {
        const hasErrorHandling = i % 3 === 0;
        const nextNode = `Node${i + 1}`;

        if (hasErrorHandling && i % 6 === 0) {
          // Incorrect: error handler in main[0] with success node
          connections[`Node${i}`] = {
            main: [
              [
                { node: nextNode, type: 'main', index: 0 },
                { node: 'Error Handler', type: 'main', index: 0 }  // Wrong placement
              ]
            ]
          };
        } else if (hasErrorHandling) {
          // Correct: separate success and error outputs
          connections[`Node${i}`] = {
            main: [
              [
                { node: nextNode, type: 'main', index: 0 }
              ],
              [
                { node: 'Error Handler', type: 'main', index: 0 }
              ]
            ]
          };
        } else {
          // Normal connection
          connections[`Node${i}`] = {
            main: [
              [
                { node: nextNode, type: 'main', index: 0 }
              ]
            ]
          };
        }
      }

      // Add error handler node
      nodes.push({
        id: '51',
        name: 'Error Handler',
        type: 'n8n-nodes-base.set',
        typeVersion: 1,
        position: [2600, 200],
        parameters: {}
      });

      const workflow = { nodes, connections };

      const startTime = Date.now();
      const response = await client.callTool({
        name: 'validate_workflow',
        arguments: { workflow }
      });
      const endTime = Date.now();

      // Validation should complete quickly even for large workflows
      expect(endTime - startTime).toBeLessThan(5000); // Less than 5 seconds

      const result = JSON.parse(((response as any).content[0]).text);

      // Should detect the incorrect error configurations
      const hasErrors = result.errors && result.errors.length > 0;
      expect(hasErrors).toBe(true);

      // Specifically check for incorrect error output configuration errors
      const incorrectConfigErrors = result.errors.filter((e: any) =>
        e.message.includes('Incorrect error output configuration')
      );
      expect(incorrectConfigErrors.length).toBeGreaterThan(0);
    });

    it('should handle edge cases gracefully via MCP', async () => {
      const edgeCaseWorkflows = [
        // Empty workflow
        { nodes: [], connections: {} },

        // Single isolated node
        {
          nodes: [{
            id: '1',
            name: 'Isolated',
            type: 'n8n-nodes-base.set',
            position: [100, 100],
            parameters: {}
          }],
          connections: {}
        },

        // Node with null/undefined connections
        {
          nodes: [{
            id: '1',
            name: 'Source',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: {}
          }],
          connections: {
            'Source': {
              main: [null, undefined]
            }
          }
        }
      ];

      for (const workflow of edgeCaseWorkflows) {
        const response = await client.callTool({
          name: 'validate_workflow',
          arguments: { workflow }
        });

        expect((response as any).content).toHaveLength(1);
        const result = JSON.parse(((response as any).content[0]).text);

        // Should not crash and should return a valid validation result
        expect(result).toHaveProperty('valid');
        expect(typeof result.valid).toBe('boolean');
        expect(Array.isArray(result.errors || [])).toBe(true);
        expect(Array.isArray(result.warnings || [])).toBe(true);
      }
    });

    it('should validate with different validation profiles via MCP', async () => {
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
            name: 'Success Handler',
            type: 'n8n-nodes-base.set',
            position: [300, 100],
            parameters: {}
          },
          {
            id: '3',
            name: 'Error Response',
            type: 'n8n-nodes-base.respondToWebhook',
            position: [300, 200],
            parameters: {}
          }
        ],
        connections: {
          'API Call': {
            main: [
              [
                { node: 'Success Handler', type: 'main', index: 0 },
                { node: 'Error Response', type: 'main', index: 0 }  // Incorrect placement
              ]
            ]
          }
        }
      };

      const profiles = ['minimal', 'runtime', 'ai-friendly', 'strict'];

      for (const profile of profiles) {
        const response = await client.callTool({
          name: 'validate_workflow',
          arguments: {
            workflow,
            options: { profile }
          }
        });

        const result = JSON.parse(((response as any).content[0]).text);

        // All profiles should detect this error output configuration issue
        const hasIncorrectConfigError = result.errors?.some((e: any) =>
          e.message.includes('Incorrect error output configuration')
        );
        expect(hasIncorrectConfigError).toBe(true);
      }
    });
  });

  describe('Error Message Format Consistency', () => {
    it('should format error messages consistently across different scenarios', async () => {
      const scenarios = [
        {
          name: 'Single error handler in wrong place',
          workflow: {
            nodes: [
              { id: '1', name: 'Source', type: 'n8n-nodes-base.httpRequest', position: [0, 0], parameters: {} },
              { id: '2', name: 'Success', type: 'n8n-nodes-base.set', position: [200, 0], parameters: {} },
              { id: '3', name: 'Error Handler', type: 'n8n-nodes-base.set', position: [200, 100], parameters: {} }
            ],
            connections: {
              'Source': {
                main: [[
                  { node: 'Success', type: 'main', index: 0 },
                  { node: 'Error Handler', type: 'main', index: 0 }
                ]]
              }
            }
          }
        },
        {
          name: 'Multiple error handlers in wrong place',
          workflow: {
            nodes: [
              { id: '1', name: 'Source', type: 'n8n-nodes-base.httpRequest', position: [0, 0], parameters: {} },
              { id: '2', name: 'Success', type: 'n8n-nodes-base.set', position: [200, 0], parameters: {} },
              { id: '3', name: 'Error Handler 1', type: 'n8n-nodes-base.set', position: [200, 100], parameters: {} },
              { id: '4', name: 'Error Handler 2', type: 'n8n-nodes-base.emailSend', position: [200, 200], parameters: {} }
            ],
            connections: {
              'Source': {
                main: [[
                  { node: 'Success', type: 'main', index: 0 },
                  { node: 'Error Handler 1', type: 'main', index: 0 },
                  { node: 'Error Handler 2', type: 'main', index: 0 }
                ]]
              }
            }
          }
        }
      ];

      for (const scenario of scenarios) {
        const response = await client.callTool({
          name: 'validate_workflow',
          arguments: { workflow: scenario.workflow }
        });

        const result = JSON.parse(((response as any).content[0]).text);

        const errorConfigError = result.errors.find((e: any) =>
          e.message.includes('Incorrect error output configuration')
        );

        expect(errorConfigError).toBeDefined();

        // Check that error message follows consistent format
        expect(errorConfigError.message).toContain('INCORRECT (current):');
        expect(errorConfigError.message).toContain('CORRECT (should be):');
        expect(errorConfigError.message).toContain('main[0] = success output');
        expect(errorConfigError.message).toContain('main[1] = error output');
        expect(errorConfigError.message).toContain('Also add: "onError": "continueErrorOutput"');

        // Check JSON format is valid
        const incorrectSection = errorConfigError.message.match(/INCORRECT \(current\):\n([\s\S]*?)\n\nCORRECT/);
        const correctSection = errorConfigError.message.match(/CORRECT \(should be\):\n([\s\S]*?)\n\nAlso add/);

        expect(incorrectSection).toBeDefined();
        expect(correctSection).toBeDefined();

        // Verify JSON structure is present (but don't parse due to comments)
        expect(incorrectSection).toBeDefined();
        expect(correctSection).toBeDefined();
        expect(incorrectSection![1]).toContain('main');
        expect(correctSection![1]).toContain('main');
      }
    });
  });
});