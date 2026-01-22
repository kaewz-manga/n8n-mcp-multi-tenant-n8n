import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowValidator } from '@/services/workflow-validator';
import { NodeRepository } from '@/database/node-repository';
import { EnhancedConfigValidator } from '@/services/enhanced-config-validator';

vi.mock('@/utils/logger');

describe('WorkflowValidator - Performance Tests', () => {
  let validator: WorkflowValidator;
  let mockNodeRepository: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock repository with performance optimizations
    mockNodeRepository = {
      getNode: vi.fn((type: string) => {
        // Return mock node info for any node type to avoid database calls
        return {
          node_type: type,
          display_name: 'Mock Node',
          isVersioned: true,
          version: 1
        };
      })
    };

    validator = new WorkflowValidator(mockNodeRepository, EnhancedConfigValidator);
  });

  describe('Large Workflow Performance', () => {
    it('should validate large workflows with many error paths efficiently', async () => {
      // Generate a large workflow with 500 nodes
      const nodeCount = 500;
      const nodes = [];
      const connections: any = {};

      // Create nodes with various error handling patterns
      for (let i = 1; i <= nodeCount; i++) {
        nodes.push({
          id: i.toString(),
          name: `Node${i}`,
          type: i % 5 === 0 ? 'n8n-nodes-base.httpRequest' : 'n8n-nodes-base.set',
          typeVersion: 1,
          position: [i * 10, (i % 10) * 100],
          parameters: {},
          ...(i % 3 === 0 ? { onError: 'continueErrorOutput' } : {})
        });
      }

      // Create connections with multiple error handling scenarios
      for (let i = 1; i < nodeCount; i++) {
        const hasErrorHandling = i % 3 === 0;
        const hasMultipleConnections = i % 7 === 0;

        if (hasErrorHandling && hasMultipleConnections) {
          // Mix correct and incorrect error handling patterns
          const isIncorrect = i % 14 === 0;

          if (isIncorrect) {
            // Incorrect: error handlers mixed with success nodes in main[0]
            connections[`Node${i}`] = {
              main: [
                [
                  { node: `Node${i + 1}`, type: 'main', index: 0 },
                  { node: `Error Handler ${i}`, type: 'main', index: 0 } // Wrong!
                ]
              ]
            };
          } else {
            // Correct: separate success and error outputs
            connections[`Node${i}`] = {
              main: [
                [
                  { node: `Node${i + 1}`, type: 'main', index: 0 }
                ],
                [
                  { node: `Error Handler ${i}`, type: 'main', index: 0 }
                ]
              ]
            };
          }

          // Add error handler node
          nodes.push({
            id: `error-${i}`,
            name: `Error Handler ${i}`,
            type: 'n8n-nodes-base.respondToWebhook',
            typeVersion: 1,
            position: [(i + nodeCount) * 10, 500],
            parameters: {}
          });
        } else {
          // Simple connection
          connections[`Node${i}`] = {
            main: [
              [
                { node: `Node${i + 1}`, type: 'main', index: 0 }
              ]
            ]
          };
        }
      }

      const workflow = { nodes, connections };

      const startTime = performance.now();
      const result = await validator.validateWorkflow(workflow as any);
      const endTime = performance.now();

      const executionTime = endTime - startTime;

      // Validation should complete within reasonable time
      expect(executionTime).toBeLessThan(10000); // Less than 10 seconds

      // Should still catch validation errors
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);

      // Should detect incorrect error configurations
      const incorrectConfigErrors = result.errors.filter(e =>
        e.message.includes('Incorrect error output configuration')
      );
      expect(incorrectConfigErrors.length).toBeGreaterThan(0);

      console.log(`Validated ${nodes.length} nodes in ${executionTime.toFixed(2)}ms`);
      console.log(`Found ${result.errors.length} errors and ${result.warnings.length} warnings`);
    });

    it('should handle deeply nested error handling chains efficiently', async () => {
      // Create a chain of error handlers, each with their own error handling
      const chainLength = 100;
      const nodes = [];
      const connections: any = {};

      for (let i = 1; i <= chainLength; i++) {
        // Main processing node
        nodes.push({
          id: `main-${i}`,
          name: `Main ${i}`,
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 1,
          position: [i * 150, 100],
          parameters: {},
          onError: 'continueErrorOutput'
        });

        // Error handler node
        nodes.push({
          id: `error-${i}`,
          name: `Error Handler ${i}`,
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 1,
          position: [i * 150, 300],
          parameters: {},
          onError: 'continueErrorOutput'
        });

        // Fallback error node
        nodes.push({
          id: `fallback-${i}`,
          name: `Fallback ${i}`,
          type: 'n8n-nodes-base.set',
          typeVersion: 1,
          position: [i * 150, 500],
          parameters: {}
        });

        // Connections
        connections[`Main ${i}`] = {
          main: [
            // Success path
            i < chainLength ? [{ node: `Main ${i + 1}`, type: 'main', index: 0 }] : [],
            // Error path
            [{ node: `Error Handler ${i}`, type: 'main', index: 0 }]
          ]
        };

        connections[`Error Handler ${i}`] = {
          main: [
            // Success path (continue to next error handler or end)
            [],
            // Error path (go to fallback)
            [{ node: `Fallback ${i}`, type: 'main', index: 0 }]
          ]
        };
      }

      const workflow = { nodes, connections };

      const startTime = performance.now();
      const result = await validator.validateWorkflow(workflow as any);
      const endTime = performance.now();

      const executionTime = endTime - startTime;

      // Should complete quickly even with complex nested error handling
      expect(executionTime).toBeLessThan(5000); // Less than 5 seconds

      // Should not have errors about incorrect configuration (this is correct)
      const incorrectConfigErrors = result.errors.filter(e =>
        e.message.includes('Incorrect error output configuration')
      );
      expect(incorrectConfigErrors.length).toBe(0);

      console.log(`Validated ${nodes.length} nodes with nested error handling in ${executionTime.toFixed(2)}ms`);
    });

    it('should efficiently validate workflows with many parallel error paths', async () => {
      // Create a workflow with one source node that fans out to many parallel paths,
      // each with their own error handling
      const parallelPathCount = 200;
      const nodes = [
        {
          id: 'source',
          name: 'Source',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 1,
          position: [0, 0],
          parameters: {}
        }
      ];
      const connections: any = {
        'Source': {
          main: [[]]
        }
      };

      // Create parallel paths
      for (let i = 1; i <= parallelPathCount; i++) {
        // Processing node
        nodes.push({
          id: `process-${i}`,
          name: `Process ${i}`,
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 1,
          position: [200, i * 20],
          parameters: {},
          onError: 'continueErrorOutput'
        } as any);

        // Success handler
        nodes.push({
          id: `success-${i}`,
          name: `Success ${i}`,
          type: 'n8n-nodes-base.set',
          typeVersion: 1,
          position: [400, i * 20],
          parameters: {}
        });

        // Error handler
        nodes.push({
          id: `error-${i}`,
          name: `Error Handler ${i}`,
          type: 'n8n-nodes-base.respondToWebhook',
          typeVersion: 1,
          position: [400, i * 20 + 10],
          parameters: {}
        });

        // Connect source to processing node
        connections['Source'].main[0].push({
          node: `Process ${i}`,
          type: 'main',
          index: 0
        });

        // Connect processing node to success and error handlers
        connections[`Process ${i}`] = {
          main: [
            [{ node: `Success ${i}`, type: 'main', index: 0 }],
            [{ node: `Error Handler ${i}`, type: 'main', index: 0 }]
          ]
        };
      }

      const workflow = { nodes, connections };

      const startTime = performance.now();
      const result = await validator.validateWorkflow(workflow as any);
      const endTime = performance.now();

      const executionTime = endTime - startTime;

      // Should validate efficiently despite many parallel paths
      expect(executionTime).toBeLessThan(8000); // Less than 8 seconds

      // Should not have errors about incorrect configuration
      const incorrectConfigErrors = result.errors.filter(e =>
        e.message.includes('Incorrect error output configuration')
      );
      expect(incorrectConfigErrors.length).toBe(0);

      console.log(`Validated ${nodes.length} nodes with ${parallelPathCount} parallel error paths in ${executionTime.toFixed(2)}ms`);
    });

    it('should handle worst-case scenario with many incorrect configurations efficiently', async () => {
      // Create a workflow where many nodes have the incorrect error configuration
      // This tests the performance of the error detection algorithm
      const nodeCount = 300;
      const nodes = [];
      const connections: any = {};

      for (let i = 1; i <= nodeCount; i++) {
        // Main node
        nodes.push({
          id: `main-${i}`,
          name: `Main ${i}`,
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 1,
          position: [i * 20, 100],
          parameters: {}
        });

        // Success handler
        nodes.push({
          id: `success-${i}`,
          name: `Success ${i}`,
          type: 'n8n-nodes-base.set',
          typeVersion: 1,
          position: [i * 20, 200],
          parameters: {}
        });

        // Error handler (with error-indicating name)
        nodes.push({
          id: `error-${i}`,
          name: `Error Handler ${i}`,
          type: 'n8n-nodes-base.respondToWebhook',
          typeVersion: 1,
          position: [i * 20, 300],
          parameters: {}
        });

        // INCORRECT configuration: both success and error handlers in main[0]
        connections[`Main ${i}`] = {
          main: [
            [
              { node: `Success ${i}`, type: 'main', index: 0 },
              { node: `Error Handler ${i}`, type: 'main', index: 0 } // Wrong!
            ]
          ]
        };
      }

      const workflow = { nodes, connections };

      const startTime = performance.now();
      const result = await validator.validateWorkflow(workflow as any);
      const endTime = performance.now();

      const executionTime = endTime - startTime;

      // Should complete within reasonable time even when generating many errors
      expect(executionTime).toBeLessThan(15000); // Less than 15 seconds

      // Should detect ALL incorrect configurations
      const incorrectConfigErrors = result.errors.filter(e =>
        e.message.includes('Incorrect error output configuration')
      );
      expect(incorrectConfigErrors.length).toBe(nodeCount); // One error per node

      console.log(`Detected ${incorrectConfigErrors.length} incorrect configurations in ${nodes.length} nodes in ${executionTime.toFixed(2)}ms`);
    });
  });

  describe('Memory Usage and Optimization', () => {
    it('should not leak memory during large workflow validation', async () => {
      // Get initial memory usage
      const initialMemory = process.memoryUsage().heapUsed;

      // Validate multiple large workflows
      for (let run = 0; run < 5; run++) {
        const nodeCount = 200;
        const nodes = [];
        const connections: any = {};

        for (let i = 1; i <= nodeCount; i++) {
          nodes.push({
            id: i.toString(),
            name: `Node${i}`,
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 1,
            position: [i * 10, 100],
            parameters: {},
            onError: 'continueErrorOutput'
          });

          if (i > 1) {
            connections[`Node${i - 1}`] = {
              main: [
                [{ node: `Node${i}`, type: 'main', index: 0 }],
                [{ node: `Error${i}`, type: 'main', index: 0 }]
              ]
            };

            nodes.push({
              id: `error-${i}`,
              name: `Error${i}`,
              type: 'n8n-nodes-base.set',
              typeVersion: 1,
              position: [i * 10, 200],
              parameters: {}
            });
          }
        }

        const workflow = { nodes, connections };
        await validator.validateWorkflow(workflow as any);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncreaseMB).toBeLessThan(50);

      console.log(`Memory increase after 5 large workflow validations: ${memoryIncreaseMB.toFixed(2)}MB`);
    });

    it('should handle concurrent validation requests efficiently', async () => {
      // Create multiple validation requests that run concurrently
      const concurrentRequests = 10;
      const workflows = [];

      // Prepare workflows
      for (let r = 0; r < concurrentRequests; r++) {
        const nodeCount = 50;
        const nodes = [];
        const connections: any = {};

        for (let i = 1; i <= nodeCount; i++) {
          nodes.push({
            id: `${r}-${i}`,
            name: `R${r}Node${i}`,
            type: i % 2 === 0 ? 'n8n-nodes-base.httpRequest' : 'n8n-nodes-base.set',
            typeVersion: 1,
            position: [i * 20, r * 100],
            parameters: {},
            ...(i % 3 === 0 ? { onError: 'continueErrorOutput' } : {})
          });

          if (i > 1) {
            const hasError = i % 3 === 0;
            const isIncorrect = i % 6 === 0;

            if (hasError && isIncorrect) {
              // Incorrect configuration
              connections[`R${r}Node${i - 1}`] = {
                main: [
                  [
                    { node: `R${r}Node${i}`, type: 'main', index: 0 },
                    { node: `R${r}Error${i}`, type: 'main', index: 0 } // Wrong!
                  ]
                ]
              };

              nodes.push({
                id: `${r}-error-${i}`,
                name: `R${r}Error${i}`,
                type: 'n8n-nodes-base.respondToWebhook',
                typeVersion: 1,
                position: [i * 20, r * 100 + 50],
                parameters: {}
              });
            } else if (hasError) {
              // Correct configuration
              connections[`R${r}Node${i - 1}`] = {
                main: [
                  [{ node: `R${r}Node${i}`, type: 'main', index: 0 }],
                  [{ node: `R${r}Error${i}`, type: 'main', index: 0 }]
                ]
              };

              nodes.push({
                id: `${r}-error-${i}`,
                name: `R${r}Error${i}`,
                type: 'n8n-nodes-base.set',
                typeVersion: 1,
                position: [i * 20, r * 100 + 50],
                parameters: {}
              });
            } else {
              // Normal connection
              connections[`R${r}Node${i - 1}`] = {
                main: [
                  [{ node: `R${r}Node${i}`, type: 'main', index: 0 }]
                ]
              };
            }
          }
        }

        workflows.push({ nodes, connections });
      }

      // Run concurrent validations
      const startTime = performance.now();
      const results = await Promise.all(
        workflows.map(workflow => validator.validateWorkflow(workflow as any))
      );
      const endTime = performance.now();

      const totalTime = endTime - startTime;

      // All validations should complete
      expect(results).toHaveLength(concurrentRequests);

      // Each result should be valid
      results.forEach(result => {
        expect(Array.isArray(result.errors)).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
      });

      // Concurrent execution should be efficient
      expect(totalTime).toBeLessThan(20000); // Less than 20 seconds total

      console.log(`Completed ${concurrentRequests} concurrent validations in ${totalTime.toFixed(2)}ms`);
    });
  });
});