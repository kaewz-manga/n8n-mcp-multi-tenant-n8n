/**
 * Integration tests for AI node connection validation in workflow diff operations
 * Tests that AI nodes with AI-specific connection types (ai_languageModel, ai_memory, etc.)
 * are properly validated without requiring main connections
 *
 * Related to issue #357
 */

import { describe, test, expect } from 'vitest';
import { WorkflowDiffEngine } from '../../../src/services/workflow-diff-engine';

describe('AI Node Connection Validation', () => {
  describe('AI-specific connection types', () => {
    test('should accept workflow with ai_languageModel connections', async () => {
      const workflow = {
        id: 'test-workflow',
        name: 'AI Language Model Test',
        nodes: [
          {
            id: 'agent-node',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1,
            position: [0, 0],
            parameters: {}
          },
          {
            id: 'llm-node',
            name: 'OpenAI Chat Model',
            type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
            typeVersion: 1,
            position: [200, 0],
            parameters: {}
          }
        ],
        connections: {
          'OpenAI Chat Model': {
            ai_languageModel: [
              [{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]
            ]
          }
        }
      };

      const engine = new WorkflowDiffEngine();
      const result = await engine.applyDiff(workflow as any, {
        id: workflow.id,
        operations: []
      });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
    });

    test('should accept workflow with ai_memory connections', async () => {
      const workflow = {
        id: 'test-workflow',
        name: 'AI Memory Test',
        nodes: [
          {
            id: 'agent-node',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1,
            position: [0, 0],
            parameters: {}
          },
          {
            id: 'memory-node',
            name: 'Postgres Chat Memory',
            type: '@n8n/n8n-nodes-langchain.memoryPostgresChat',
            typeVersion: 1,
            position: [200, 0],
            parameters: {}
          }
        ],
        connections: {
          'Postgres Chat Memory': {
            ai_memory: [
              [{ node: 'AI Agent', type: 'ai_memory', index: 0 }]
            ]
          }
        }
      };

      const engine = new WorkflowDiffEngine();
      const result = await engine.applyDiff(workflow as any, {
        id: workflow.id,
        operations: []
      });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
    });

    test('should accept workflow with ai_embedding connections', async () => {
      const workflow = {
        id: 'test-workflow',
        name: 'AI Embedding Test',
        nodes: [
          {
            id: 'vectorstore-node',
            name: 'Vector Store',
            type: '@n8n/n8n-nodes-langchain.vectorStoreSupabase',
            typeVersion: 1,
            position: [0, 0],
            parameters: {}
          },
          {
            id: 'embedding-node',
            name: 'Embeddings OpenAI',
            type: '@n8n/n8n-nodes-langchain.embeddingsOpenAi',
            typeVersion: 1,
            position: [200, 0],
            parameters: {}
          }
        ],
        connections: {
          'Embeddings OpenAI': {
            ai_embedding: [
              [{ node: 'Vector Store', type: 'ai_embedding', index: 0 }]
            ]
          }
        }
      };

      const engine = new WorkflowDiffEngine();
      const result = await engine.applyDiff(workflow as any, {
        id: workflow.id,
        operations: []
      });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
    });

    test('should accept workflow with ai_tool connections', async () => {
      const workflow = {
        id: 'test-workflow',
        name: 'AI Tool Test',
        nodes: [
          {
            id: 'agent-node',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1,
            position: [0, 0],
            parameters: {}
          },
          {
            id: 'vectorstore-node',
            name: 'Vector Store Tool',
            type: '@n8n/n8n-nodes-langchain.vectorStoreSupabase',
            typeVersion: 1,
            position: [200, 0],
            parameters: {}
          }
        ],
        connections: {
          'Vector Store Tool': {
            ai_tool: [
              [{ node: 'AI Agent', type: 'ai_tool', index: 0 }]
            ]
          }
        }
      };

      const engine = new WorkflowDiffEngine();
      const result = await engine.applyDiff(workflow as any, {
        id: workflow.id,
        operations: []
      });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
    });

    test('should accept workflow with ai_vectorStore connections', async () => {
      const workflow = {
        id: 'test-workflow',
        name: 'AI Vector Store Test',
        nodes: [
          {
            id: 'agent-node',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1,
            position: [0, 0],
            parameters: {}
          },
          {
            id: 'vectorstore-node',
            name: 'Supabase Vector Store',
            type: '@n8n/n8n-nodes-langchain.vectorStoreSupabase',
            typeVersion: 1,
            position: [200, 0],
            parameters: {}
          }
        ],
        connections: {
          'Supabase Vector Store': {
            ai_vectorStore: [
              [{ node: 'AI Agent', type: 'ai_vectorStore', index: 0 }]
            ]
          }
        }
      };

      const engine = new WorkflowDiffEngine();
      const result = await engine.applyDiff(workflow as any, {
        id: workflow.id,
        operations: []
      });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
    });
  });

  describe('Mixed connection types', () => {
    test('should accept workflow mixing main and AI connections', async () => {
      const workflow = {
        id: 'test-workflow',
        name: 'Mixed Connections Test',
        nodes: [
          {
            id: 'webhook-node',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [0, 0],
            parameters: {}
          },
          {
            id: 'agent-node',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1,
            position: [200, 0],
            parameters: {}
          },
          {
            id: 'llm-node',
            name: 'OpenAI Chat Model',
            type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
            typeVersion: 1,
            position: [200, 200],
            parameters: {}
          },
          {
            id: 'respond-node',
            name: 'Respond to Webhook',
            type: 'n8n-nodes-base.respondToWebhook',
            typeVersion: 1,
            position: [400, 0],
            parameters: {}
          }
        ],
        connections: {
          'Webhook': {
            main: [
              [{ node: 'AI Agent', type: 'main', index: 0 }]
            ]
          },
          'AI Agent': {
            main: [
              [{ node: 'Respond to Webhook', type: 'main', index: 0 }]
            ]
          },
          'OpenAI Chat Model': {
            ai_languageModel: [
              [{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]
            ]
          }
        }
      };

      const engine = new WorkflowDiffEngine();
      const result = await engine.applyDiff(workflow as any, {
        id: workflow.id,
        operations: []
      });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
    });

    test('should accept workflow with error connections alongside AI connections', async () => {
      const workflow = {
        id: 'test-workflow',
        name: 'Error + AI Connections Test',
        nodes: [
          {
            id: 'webhook-node',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [0, 0],
            parameters: {}
          },
          {
            id: 'agent-node',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1,
            position: [200, 0],
            parameters: {}
          },
          {
            id: 'llm-node',
            name: 'OpenAI Chat Model',
            type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
            typeVersion: 1,
            position: [200, 200],
            parameters: {}
          },
          {
            id: 'error-handler',
            name: 'Error Handler',
            type: 'n8n-nodes-base.set',
            typeVersion: 1,
            position: [200, -200],
            parameters: {}
          }
        ],
        connections: {
          'Webhook': {
            main: [
              [{ node: 'AI Agent', type: 'main', index: 0 }]
            ]
          },
          'AI Agent': {
            error: [
              [{ node: 'Error Handler', type: 'main', index: 0 }]
            ]
          },
          'OpenAI Chat Model': {
            ai_languageModel: [
              [{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]
            ]
          }
        }
      };

      const engine = new WorkflowDiffEngine();
      const result = await engine.applyDiff(workflow as any, {
        id: workflow.id,
        operations: []
      });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
    });
  });

  describe('Complex AI workflow (Issue #357 scenario)', () => {
    test('should accept full AI agent workflow with RAG components', async () => {
      // Simplified version of the workflow from issue #357
      const workflow = {
        id: 'test-workflow',
        name: 'AI Agent with RAG',
        nodes: [
          {
            id: 'webhook-node',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 2,
            position: [0, 0],
            parameters: {}
          },
          {
            id: 'code-node',
            name: 'Prepare Inputs',
            type: 'n8n-nodes-base.code',
            typeVersion: 2,
            position: [200, 0],
            parameters: {}
          },
          {
            id: 'agent-node',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1.7,
            position: [400, 0],
            parameters: {}
          },
          {
            id: 'llm-node',
            name: 'OpenAI Chat Model',
            type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
            typeVersion: 1,
            position: [400, 200],
            parameters: {}
          },
          {
            id: 'memory-node',
            name: 'Postgres Chat Memory',
            type: '@n8n/n8n-nodes-langchain.memoryPostgresChat',
            typeVersion: 1.1,
            position: [500, 200],
            parameters: {}
          },
          {
            id: 'embedding-node',
            name: 'Embeddings OpenAI',
            type: '@n8n/n8n-nodes-langchain.embeddingsOpenAi',
            typeVersion: 1,
            position: [600, 400],
            parameters: {}
          },
          {
            id: 'vectorstore-node',
            name: 'Supabase Vector Store',
            type: '@n8n/n8n-nodes-langchain.vectorStoreSupabase',
            typeVersion: 1.3,
            position: [600, 200],
            parameters: {}
          },
          {
            id: 'respond-node',
            name: 'Respond to Webhook',
            type: 'n8n-nodes-base.respondToWebhook',
            typeVersion: 1.1,
            position: [600, 0],
            parameters: {}
          }
        ],
        connections: {
          'Webhook': {
            main: [
              [{ node: 'Prepare Inputs', type: 'main', index: 0 }]
            ]
          },
          'Prepare Inputs': {
            main: [
              [{ node: 'AI Agent', type: 'main', index: 0 }]
            ]
          },
          'AI Agent': {
            main: [
              [{ node: 'Respond to Webhook', type: 'main', index: 0 }]
            ]
          },
          'OpenAI Chat Model': {
            ai_languageModel: [
              [{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]
            ]
          },
          'Postgres Chat Memory': {
            ai_memory: [
              [{ node: 'AI Agent', type: 'ai_memory', index: 0 }]
            ]
          },
          'Embeddings OpenAI': {
            ai_embedding: [
              [{ node: 'Supabase Vector Store', type: 'ai_embedding', index: 0 }]
            ]
          },
          'Supabase Vector Store': {
            ai_tool: [
              [{ node: 'AI Agent', type: 'ai_tool', index: 0 }]
            ]
          }
        }
      };

      const engine = new WorkflowDiffEngine();
      const result = await engine.applyDiff(workflow as any, {
        id: workflow.id,
        operations: []
      });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
      expect(result.errors || []).toHaveLength(0);
    });

    test('should successfully update AI workflow nodes without connection errors', async () => {
      // Test that we can update nodes in an AI workflow without triggering validation errors
      const workflow = {
        id: 'test-workflow',
        name: 'AI Workflow Update Test',
        nodes: [
          {
            id: 'webhook-node',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 2,
            position: [0, 0],
            parameters: { path: 'test' }
          },
          {
            id: 'agent-node',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1,
            position: [200, 0],
            parameters: {}
          },
          {
            id: 'llm-node',
            name: 'OpenAI Chat Model',
            type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
            typeVersion: 1,
            position: [200, 200],
            parameters: {}
          }
        ],
        connections: {
          'Webhook': {
            main: [
              [{ node: 'AI Agent', type: 'main', index: 0 }]
            ]
          },
          'OpenAI Chat Model': {
            ai_languageModel: [
              [{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]
            ]
          }
        }
      };

      const engine = new WorkflowDiffEngine();

      // Update the webhook node (unrelated to AI nodes)
      const result = await engine.applyDiff(workflow as any, {
        id: workflow.id,
        operations: [
          {
            type: 'updateNode',
            nodeId: 'webhook-node',
            updates: {
              notes: 'Updated webhook configuration'
            }
          }
        ]
      });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
      expect(result.errors || []).toHaveLength(0);

      // Verify the update was applied
      const updatedNode = result.workflow.nodes.find((n: any) => n.id === 'webhook-node');
      expect(updatedNode?.notes).toBe('Updated webhook configuration');
    });
  });

  describe('Node-only AI nodes (no main connections)', () => {
    test('should accept AI nodes with ONLY ai_languageModel connections', async () => {
      const workflow = {
        id: 'test-workflow',
        name: 'AI Node Without Main',
        nodes: [
          {
            id: 'agent-node',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1,
            position: [0, 0],
            parameters: {}
          },
          {
            id: 'llm-node',
            name: 'OpenAI Chat Model',
            type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
            typeVersion: 1,
            position: [200, 0],
            parameters: {}
          }
        ],
        connections: {
          // OpenAI Chat Model has NO main connections, ONLY ai_languageModel
          'OpenAI Chat Model': {
            ai_languageModel: [
              [{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]
            ]
          }
        }
      };

      const engine = new WorkflowDiffEngine();
      const result = await engine.applyDiff(workflow as any, {
        id: workflow.id,
        operations: []
      });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
      expect(result.errors || []).toHaveLength(0);
    });

    test('should accept AI nodes with ONLY ai_memory connections', async () => {
      const workflow = {
        id: 'test-workflow',
        name: 'Memory Node Without Main',
        nodes: [
          {
            id: 'agent-node',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1,
            position: [0, 0],
            parameters: {}
          },
          {
            id: 'memory-node',
            name: 'Postgres Chat Memory',
            type: '@n8n/n8n-nodes-langchain.memoryPostgresChat',
            typeVersion: 1,
            position: [200, 0],
            parameters: {}
          }
        ],
        connections: {
          // Memory node has NO main connections, ONLY ai_memory
          'Postgres Chat Memory': {
            ai_memory: [
              [{ node: 'AI Agent', type: 'ai_memory', index: 0 }]
            ]
          }
        }
      };

      const engine = new WorkflowDiffEngine();
      const result = await engine.applyDiff(workflow as any, {
        id: workflow.id,
        operations: []
      });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
      expect(result.errors || []).toHaveLength(0);
    });

    test('should accept embedding nodes with ONLY ai_embedding connections', async () => {
      const workflow = {
        id: 'test-workflow',
        name: 'Embedding Node Without Main',
        nodes: [
          {
            id: 'vectorstore-node',
            name: 'Vector Store',
            type: '@n8n/n8n-nodes-langchain.vectorStoreSupabase',
            typeVersion: 1,
            position: [0, 0],
            parameters: {}
          },
          {
            id: 'embedding-node',
            name: 'Embeddings OpenAI',
            type: '@n8n/n8n-nodes-langchain.embeddingsOpenAi',
            typeVersion: 1,
            position: [200, 0],
            parameters: {}
          }
        ],
        connections: {
          // Embedding node has NO main connections, ONLY ai_embedding
          'Embeddings OpenAI': {
            ai_embedding: [
              [{ node: 'Vector Store', type: 'ai_embedding', index: 0 }]
            ]
          }
        }
      };

      const engine = new WorkflowDiffEngine();
      const result = await engine.applyDiff(workflow as any, {
        id: workflow.id,
        operations: []
      });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
      expect(result.errors || []).toHaveLength(0);
    });

    test('should accept vector store nodes with ONLY ai_tool connections', async () => {
      const workflow = {
        id: 'test-workflow',
        name: 'Vector Store Node Without Main',
        nodes: [
          {
            id: 'agent-node',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1,
            position: [0, 0],
            parameters: {}
          },
          {
            id: 'vectorstore-node',
            name: 'Supabase Vector Store',
            type: '@n8n/n8n-nodes-langchain.vectorStoreSupabase',
            typeVersion: 1,
            position: [200, 0],
            parameters: {}
          }
        ],
        connections: {
          // Vector store has NO main connections, ONLY ai_tool
          'Supabase Vector Store': {
            ai_tool: [
              [{ node: 'AI Agent', type: 'ai_tool', index: 0 }]
            ]
          }
        }
      };

      const engine = new WorkflowDiffEngine();
      const result = await engine.applyDiff(workflow as any, {
        id: workflow.id,
        operations: []
      });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
      expect(result.errors || []).toHaveLength(0);
    });
  });
});
