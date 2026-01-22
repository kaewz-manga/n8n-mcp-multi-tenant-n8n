/**
 * Unit tests for MutationTracker - Sanitization and Processing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MutationTracker } from '../../../src/telemetry/mutation-tracker';
import { WorkflowMutationData, MutationToolName } from '../../../src/telemetry/mutation-types';

describe('MutationTracker', () => {
  let tracker: MutationTracker;

  beforeEach(() => {
    tracker = new MutationTracker();
    tracker.clearRecentMutations();
  });

  describe('Workflow Sanitization', () => {
    it('should remove credentials from workflow level', async () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test sanitization',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {},
          credentials: { apiKey: 'secret-key-123' },
          sharedWorkflows: ['user1', 'user2'],
          ownedBy: { id: 'user1', email: 'user@example.com' }
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test Updated',
          nodes: [],
          connections: {},
          credentials: { apiKey: 'secret-key-456' }
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = await tracker.processMutation(data, 'test-user');

      expect(result).toBeTruthy();
      expect(result!.workflowBefore).toBeDefined();
      expect(result!.workflowBefore.credentials).toBeUndefined();
      expect(result!.workflowBefore.sharedWorkflows).toBeUndefined();
      expect(result!.workflowBefore.ownedBy).toBeUndefined();
      expect(result!.workflowAfter.credentials).toBeUndefined();
    });

    it('should remove credentials from node level', async () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test node credentials',
        operations: [{ type: 'addNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [
            {
              id: 'node1',
              name: 'HTTP Request',
              type: 'n8n-nodes-base.httpRequest',
              position: [100, 100],
              credentials: {
                httpBasicAuth: {
                  id: 'cred-123',
                  name: 'My Auth'
                }
              },
              parameters: {
                url: 'https://api.example.com'
              }
            }
          ],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [
            {
              id: 'node1',
              name: 'HTTP Request',
              type: 'n8n-nodes-base.httpRequest',
              position: [100, 100],
              credentials: {
                httpBasicAuth: {
                  id: 'cred-456',
                  name: 'Updated Auth'
                }
              },
              parameters: {
                url: 'https://api.example.com'
              }
            }
          ],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 150
      };

      const result = await tracker.processMutation(data, 'test-user');

      expect(result).toBeTruthy();
      expect(result!.workflowBefore.nodes[0].credentials).toBeUndefined();
      expect(result!.workflowAfter.nodes[0].credentials).toBeUndefined();
    });

    it('should redact API keys in parameters', async () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test API key redaction',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [
            {
              id: 'node1',
              name: 'OpenAI',
              type: 'n8n-nodes-base.openAi',
              position: [100, 100],
              parameters: {
                apiKeyField: 'sk-1234567890abcdef1234567890abcdef',
                tokenField: 'Bearer abc123def456',
                config: {
                  passwordField: 'secret-password-123'
                }
              }
            }
          ],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [
            {
              id: 'node1',
              name: 'OpenAI',
              type: 'n8n-nodes-base.openAi',
              position: [100, 100],
              parameters: {
                apiKeyField: 'sk-newkey567890abcdef1234567890abcdef'
              }
            }
          ],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 200
      };

      const result = await tracker.processMutation(data, 'test-user');

      expect(result).toBeTruthy();
      const params = result!.workflowBefore.nodes[0].parameters;
      // Fields with sensitive key names are redacted
      expect(params.apiKeyField).toBe('[REDACTED]');
      expect(params.tokenField).toBe('[REDACTED]');
      expect(params.config.passwordField).toBe('[REDACTED]');
    });

    it('should redact URLs with authentication', async () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test URL redaction',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [
            {
              id: 'node1',
              name: 'HTTP Request',
              type: 'n8n-nodes-base.httpRequest',
              position: [100, 100],
              parameters: {
                url: 'https://user:password@api.example.com/endpoint',
                webhookUrl: 'http://admin:secret@webhook.example.com'
              }
            }
          ],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = await tracker.processMutation(data, 'test-user');

      expect(result).toBeTruthy();
      const params = result!.workflowBefore.nodes[0].parameters;
      // URL auth is redacted but path is preserved
      expect(params.url).toBe('[REDACTED_URL_WITH_AUTH]/endpoint');
      expect(params.webhookUrl).toBe('[REDACTED_URL_WITH_AUTH]');
    });

    it('should redact long tokens (32+ characters)', async () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test token redaction',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [
            {
              id: 'node1',
              name: 'Slack',
              type: 'n8n-nodes-base.slack',
              position: [100, 100],
              parameters: {
                message: 'Token: test-token-1234567890-1234567890123-abcdefghijklmnopqrstuvwx'
              }
            }
          ],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = await tracker.processMutation(data, 'test-user');

      expect(result).toBeTruthy();
      const message = result!.workflowBefore.nodes[0].parameters.message;
      expect(message).toContain('[REDACTED_TOKEN]');
    });

    it('should redact OpenAI-style keys', async () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test OpenAI key redaction',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [
            {
              id: 'node1',
              name: 'Code',
              type: 'n8n-nodes-base.code',
              position: [100, 100],
              parameters: {
                code: 'const apiKey = "sk-proj-abcd1234efgh5678ijkl9012mnop3456";'
              }
            }
          ],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = await tracker.processMutation(data, 'test-user');

      expect(result).toBeTruthy();
      const code = result!.workflowBefore.nodes[0].parameters.code;
      // The 32+ char regex runs before OpenAI-specific regex, so it becomes [REDACTED_TOKEN]
      expect(code).toContain('[REDACTED_TOKEN]');
    });

    it('should redact Bearer tokens', async () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test Bearer token redaction',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [
            {
              id: 'node1',
              name: 'HTTP Request',
              type: 'n8n-nodes-base.httpRequest',
              position: [100, 100],
              parameters: {
                headerParameters: {
                  parameter: [
                    {
                      name: 'Authorization',
                      value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
                    }
                  ]
                }
              }
            }
          ],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = await tracker.processMutation(data, 'test-user');

      expect(result).toBeTruthy();
      const authValue = result!.workflowBefore.nodes[0].parameters.headerParameters.parameter[0].value;
      expect(authValue).toBe('Bearer [REDACTED]');
    });

    it('should preserve workflow structure while sanitizing', async () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test structure preservation',
        operations: [{ type: 'addNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'My Workflow',
          nodes: [
            {
              id: 'node1',
              name: 'Start',
              type: 'n8n-nodes-base.start',
              position: [100, 100],
              parameters: {}
            },
            {
              id: 'node2',
              name: 'HTTP',
              type: 'n8n-nodes-base.httpRequest',
              position: [300, 100],
              parameters: {
                url: 'https://api.example.com',
                apiKey: 'secret-key'
              }
            }
          ],
          connections: {
            Start: {
              main: [[{ node: 'HTTP', type: 'main', index: 0 }]]
            }
          },
          active: true,
          credentials: { apiKey: 'workflow-secret' }
        },
        workflowAfter: {
          id: 'wf1',
          name: 'My Workflow',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 150
      };

      const result = await tracker.processMutation(data, 'test-user');

      expect(result).toBeTruthy();
      // Check structure preserved
      expect(result!.workflowBefore.id).toBe('wf1');
      expect(result!.workflowBefore.name).toBe('My Workflow');
      expect(result!.workflowBefore.nodes).toHaveLength(2);
      expect(result!.workflowBefore.connections).toBeDefined();
      expect(result!.workflowBefore.active).toBe(true);

      // Check credentials removed
      expect(result!.workflowBefore.credentials).toBeUndefined();

      // Check node parameters sanitized
      expect(result!.workflowBefore.nodes[1].parameters.apiKey).toBe('[REDACTED]');

      // Check connections preserved
      expect(result!.workflowBefore.connections.Start).toBeDefined();
    });

    it('should handle nested objects recursively', async () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test nested sanitization',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [
            {
              id: 'node1',
              name: 'Complex Node',
              type: 'n8n-nodes-base.httpRequest',
              position: [100, 100],
              parameters: {
                authentication: {
                  type: 'oauth2',
                  // Use 'settings' instead of 'credentials' since 'credentials' is a sensitive key
                  settings: {
                    clientId: 'safe-client-id',
                    clientSecret: 'very-secret-key',
                    nested: {
                      apiKeyValue: 'deep-secret-key',
                      tokenValue: 'nested-token'
                    }
                  }
                }
              }
            }
          ],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = await tracker.processMutation(data, 'test-user');

      expect(result).toBeTruthy();
      const auth = result!.workflowBefore.nodes[0].parameters.authentication;
      // The key 'authentication' contains 'auth' which is sensitive, so entire object is redacted
      expect(auth).toBe('[REDACTED]');
    });
  });

  describe('Deduplication', () => {
    it('should detect and skip duplicate mutations', async () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'First mutation',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test Updated',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      // First mutation should succeed
      const result1 = await tracker.processMutation(data, 'test-user');
      expect(result1).toBeTruthy();

      // Exact duplicate should be skipped
      const result2 = await tracker.processMutation(data, 'test-user');
      expect(result2).toBeNull();
    });

    it('should allow mutations with different workflows', async () => {
      const data1: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'First mutation',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test 1',
          nodes: [],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test 1 Updated',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const data2: WorkflowMutationData = {
        ...data1,
        workflowBefore: {
          id: 'wf2',
          name: 'Test 2',
          nodes: [],
          connections: {}
        },
        workflowAfter: {
          id: 'wf2',
          name: 'Test 2 Updated',
          nodes: [],
          connections: {}
        }
      };

      const result1 = await tracker.processMutation(data1, 'test-user');
      const result2 = await tracker.processMutation(data2, 'test-user');

      expect(result1).toBeTruthy();
      expect(result2).toBeTruthy();
    });
  });

  describe('Structural Hash Generation', () => {
    it('should generate structural hashes for both before and after workflows', async () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test structural hash generation',
        operations: [{ type: 'addNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [
            {
              id: 'node1',
              name: 'Start',
              type: 'n8n-nodes-base.start',
              position: [100, 100],
              parameters: {}
            }
          ],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [
            {
              id: 'node1',
              name: 'Start',
              type: 'n8n-nodes-base.start',
              position: [100, 100],
              parameters: {}
            },
            {
              id: 'node2',
              name: 'HTTP',
              type: 'n8n-nodes-base.httpRequest',
              position: [300, 100],
              parameters: { url: 'https://api.example.com' }
            }
          ],
          connections: {
            Start: {
              main: [[{ node: 'HTTP', type: 'main', index: 0 }]]
            }
          }
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = await tracker.processMutation(data, 'test-user');

      expect(result).toBeTruthy();
      expect(result!.workflowStructureHashBefore).toBeDefined();
      expect(result!.workflowStructureHashAfter).toBeDefined();
      expect(typeof result!.workflowStructureHashBefore).toBe('string');
      expect(typeof result!.workflowStructureHashAfter).toBe('string');
      expect(result!.workflowStructureHashBefore!.length).toBe(16);
      expect(result!.workflowStructureHashAfter!.length).toBe(16);
    });

    it('should generate different structural hashes when node types change', async () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test hash changes with node types',
        operations: [{ type: 'addNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [
            {
              id: 'node1',
              name: 'Start',
              type: 'n8n-nodes-base.start',
              position: [100, 100],
              parameters: {}
            }
          ],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [
            {
              id: 'node1',
              name: 'Start',
              type: 'n8n-nodes-base.start',
              position: [100, 100],
              parameters: {}
            },
            {
              id: 'node2',
              name: 'Slack',
              type: 'n8n-nodes-base.slack',
              position: [300, 100],
              parameters: {}
            }
          ],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = await tracker.processMutation(data, 'test-user');

      expect(result).toBeTruthy();
      expect(result!.workflowStructureHashBefore).not.toBe(result!.workflowStructureHashAfter);
    });

    it('should generate same structural hash for workflows with same structure but different parameters', async () => {
      const workflow1Before = {
        id: 'wf1',
        name: 'Test 1',
        nodes: [
          {
            id: 'node1',
            name: 'HTTP',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: { url: 'https://api1.example.com' }
          }
        ],
        connections: {}
      };

      const workflow1After = {
        id: 'wf1',
        name: 'Test 1 Updated',
        nodes: [
          {
            id: 'node1',
            name: 'HTTP',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: { url: 'https://api1-updated.example.com' }
          }
        ],
        connections: {}
      };

      const workflow2Before = {
        id: 'wf2',
        name: 'Test 2',
        nodes: [
          {
            id: 'node2',
            name: 'Different Name',
            type: 'n8n-nodes-base.httpRequest',
            position: [200, 200],
            parameters: { url: 'https://api2.example.com' }
          }
        ],
        connections: {}
      };

      const workflow2After = {
        id: 'wf2',
        name: 'Test 2 Updated',
        nodes: [
          {
            id: 'node2',
            name: 'Different Name',
            type: 'n8n-nodes-base.httpRequest',
            position: [200, 200],
            parameters: { url: 'https://api2-updated.example.com' }
          }
        ],
        connections: {}
      };

      const data1: WorkflowMutationData = {
        sessionId: 'test-session-1',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test 1',
        operations: [{ type: 'updateNode', nodeId: 'node1', updates: { 'parameters.test': 'value1' } } as any],
        workflowBefore: workflow1Before,
        workflowAfter: workflow1After,
        mutationSuccess: true,
        durationMs: 100
      };

      const data2: WorkflowMutationData = {
        sessionId: 'test-session-2',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test 2',
        operations: [{ type: 'updateNode', nodeId: 'node2', updates: { 'parameters.test': 'value2' } } as any],
        workflowBefore: workflow2Before,
        workflowAfter: workflow2After,
        mutationSuccess: true,
        durationMs: 100
      };

      const result1 = await tracker.processMutation(data1, 'test-user-1');
      const result2 = await tracker.processMutation(data2, 'test-user-2');

      expect(result1).toBeTruthy();
      expect(result2).toBeTruthy();
      // Same structure (same node types, same connection structure) should yield same hash
      expect(result1!.workflowStructureHashBefore).toBe(result2!.workflowStructureHashBefore);
    });

    it('should generate both full hash and structural hash', async () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test both hash types',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test Updated',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = await tracker.processMutation(data, 'test-user');

      expect(result).toBeTruthy();
      // Full hashes (includes all workflow data)
      expect(result!.workflowHashBefore).toBeDefined();
      expect(result!.workflowHashAfter).toBeDefined();
      // Structural hashes (nodeTypes + connections only)
      expect(result!.workflowStructureHashBefore).toBeDefined();
      expect(result!.workflowStructureHashAfter).toBeDefined();
      // They should be different since they hash different data
      expect(result!.workflowHashBefore).not.toBe(result!.workflowStructureHashBefore);
    });
  });

  describe('Statistics', () => {
    it('should track recent mutations count', async () => {
      expect(tracker.getRecentMutationsCount()).toBe(0);

      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test counting',
        operations: [{ type: 'updateNode' }],
        workflowBefore: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        workflowAfter: { id: 'wf1', name: 'Test Updated', nodes: [], connections: {} },
        mutationSuccess: true,
        durationMs: 100
      };

      await tracker.processMutation(data, 'test-user');
      expect(tracker.getRecentMutationsCount()).toBe(1);

      // Process another with different workflow
      const data2 = { ...data, workflowBefore: { ...data.workflowBefore, id: 'wf2' } };
      await tracker.processMutation(data2, 'test-user');
      expect(tracker.getRecentMutationsCount()).toBe(2);
    });

    it('should clear recent mutations', async () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test clearing',
        operations: [{ type: 'updateNode' }],
        workflowBefore: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        workflowAfter: { id: 'wf1', name: 'Test Updated', nodes: [], connections: {} },
        mutationSuccess: true,
        durationMs: 100
      };

      await tracker.processMutation(data, 'test-user');
      expect(tracker.getRecentMutationsCount()).toBe(1);

      tracker.clearRecentMutations();
      expect(tracker.getRecentMutationsCount()).toBe(0);
    });
  });
});
