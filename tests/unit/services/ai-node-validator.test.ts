import { describe, it, expect } from 'vitest';
import {
  validateAIAgent,
  validateChatTrigger,
  validateBasicLLMChain,
  buildReverseConnectionMap,
  getAIConnections,
  validateAISpecificNodes,
  type WorkflowNode,
  type WorkflowJson
} from '@/services/ai-node-validator';

describe('AI Node Validator', () => {
  describe('buildReverseConnectionMap', () => {
    it('should build reverse connections for AI language model', () => {
      const workflow: WorkflowJson = {
        nodes: [],
        connections: {
          'OpenAI': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);

      expect(reverseMap.get('AI Agent')).toEqual([
        {
          sourceName: 'OpenAI',
          sourceType: 'ai_languageModel',
          type: 'ai_languageModel',
          index: 0
        }
      ]);
    });

    it('should handle multiple AI connections to same node', () => {
      const workflow: WorkflowJson = {
        nodes: [],
        connections: {
          'OpenAI': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
          },
          'HTTP Request Tool': {
            'ai_tool': [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          },
          'Window Buffer Memory': {
            'ai_memory': [[{ node: 'AI Agent', type: 'ai_memory', index: 0 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const agentConnections = reverseMap.get('AI Agent');

      expect(agentConnections).toHaveLength(3);
      expect(agentConnections).toContainEqual(
        expect.objectContaining({ type: 'ai_languageModel' })
      );
      expect(agentConnections).toContainEqual(
        expect.objectContaining({ type: 'ai_tool' })
      );
      expect(agentConnections).toContainEqual(
        expect.objectContaining({ type: 'ai_memory' })
      );
    });

    it('should skip empty source names', () => {
      const workflow: WorkflowJson = {
        nodes: [],
        connections: {
          '': {
            'main': [[{ node: 'Target', type: 'main', index: 0 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);

      expect(reverseMap.has('Target')).toBe(false);
    });

    it('should skip empty target node names', () => {
      const workflow: WorkflowJson = {
        nodes: [],
        connections: {
          'Source': {
            'main': [[{ node: '', type: 'main', index: 0 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);

      expect(reverseMap.size).toBe(0);
    });
  });

  describe('getAIConnections', () => {
    it('should filter AI connections from all incoming connections', () => {
      const reverseMap = new Map();
      reverseMap.set('AI Agent', [
        { sourceName: 'Chat Trigger', type: 'main', index: 0 },
        { sourceName: 'OpenAI', type: 'ai_languageModel', index: 0 },
        { sourceName: 'HTTP Tool', type: 'ai_tool', index: 0 }
      ]);

      const aiConnections = getAIConnections('AI Agent', reverseMap);

      expect(aiConnections).toHaveLength(2);
      expect(aiConnections).not.toContainEqual(
        expect.objectContaining({ type: 'main' })
      );
    });

    it('should filter by specific AI connection type', () => {
      const reverseMap = new Map();
      reverseMap.set('AI Agent', [
        { sourceName: 'OpenAI', type: 'ai_languageModel', index: 0 },
        { sourceName: 'Tool1', type: 'ai_tool', index: 0 },
        { sourceName: 'Tool2', type: 'ai_tool', index: 1 }
      ]);

      const toolConnections = getAIConnections('AI Agent', reverseMap, 'ai_tool');

      expect(toolConnections).toHaveLength(2);
      expect(toolConnections.every(c => c.type === 'ai_tool')).toBe(true);
    });

    it('should return empty array for node with no connections', () => {
      const reverseMap = new Map();

      const connections = getAIConnections('Unknown Node', reverseMap);

      expect(connections).toEqual([]);
    });
  });

  describe('validateAIAgent', () => {
    it('should error on missing language model connection', () => {
      const node: WorkflowNode = {
        id: 'agent1',
        name: 'AI Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: {}
      };

      const workflow: WorkflowJson = {
        nodes: [node],
        connections: {}
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateAIAgent(node, reverseMap, workflow);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('language model')
        })
      );
    });

    it('should accept single language model connection', () => {
      const agent: WorkflowNode = {
        id: 'agent1',
        name: 'AI Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: { promptType: 'auto' }
      };

      const model: WorkflowNode = {
        id: 'llm1',
        name: 'OpenAI',
        type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
        position: [0, -100],
        parameters: {}
      };

      const workflow: WorkflowJson = {
        nodes: [agent, model],
        connections: {
          'OpenAI': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateAIAgent(agent, reverseMap, workflow);

      const languageModelErrors = issues.filter(i =>
        i.severity === 'error' && i.message.includes('language model')
      );
      expect(languageModelErrors).toHaveLength(0);
    });

    it('should accept dual language model connection for fallback', () => {
      const agent: WorkflowNode = {
        id: 'agent1',
        name: 'AI Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: { promptType: 'auto' },
        typeVersion: 1.7
      };

      const workflow: WorkflowJson = {
        nodes: [agent],
        connections: {
          'OpenAI GPT-4': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
          },
          'OpenAI GPT-3.5': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 1 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateAIAgent(agent, reverseMap, workflow);

      const excessModelErrors = issues.filter(i =>
        i.severity === 'error' && i.message.includes('more than 2')
      );
      expect(excessModelErrors).toHaveLength(0);
    });

    it('should error on more than 2 language model connections', () => {
      const agent: WorkflowNode = {
        id: 'agent1',
        name: 'AI Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: {}
      };

      const workflow: WorkflowJson = {
        nodes: [agent],
        connections: {
          'Model1': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
          },
          'Model2': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 1 }]]
          },
          'Model3': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 2 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateAIAgent(agent, reverseMap, workflow);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'TOO_MANY_LANGUAGE_MODELS'
        })
      );
    });

    it('should error on streaming mode with main output connections', () => {
      const agent: WorkflowNode = {
        id: 'agent1',
        name: 'AI Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: {
          promptType: 'auto',
          options: { streamResponse: true }
        }
      };

      const responseNode: WorkflowNode = {
        id: 'response1',
        name: 'Response Node',
        type: 'n8n-nodes-base.respondToWebhook',
        position: [200, 0],
        parameters: {}
      };

      const workflow: WorkflowJson = {
        nodes: [agent, responseNode],
        connections: {
          'OpenAI': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
          },
          'AI Agent': {
            'main': [[{ node: 'Response Node', type: 'main', index: 0 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateAIAgent(agent, reverseMap, workflow);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'STREAMING_WITH_MAIN_OUTPUT'
        })
      );
    });

    it('should error on missing prompt text for define promptType', () => {
      const agent: WorkflowNode = {
        id: 'agent1',
        name: 'AI Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: {
          promptType: 'define'
        }
      };

      const workflow: WorkflowJson = {
        nodes: [agent],
        connections: {
          'OpenAI': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateAIAgent(agent, reverseMap, workflow);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'MISSING_PROMPT_TEXT'
        })
      );
    });

    it('should info on short systemMessage', () => {
      const agent: WorkflowNode = {
        id: 'agent1',
        name: 'AI Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: {
          promptType: 'auto',
          systemMessage: 'Help user'  // Too short (< 20 chars)
        }
      };

      const workflow: WorkflowJson = {
        nodes: [agent],
        connections: {
          'OpenAI': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateAIAgent(agent, reverseMap, workflow);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'info',
          message: expect.stringContaining('systemMessage is very short')
        })
      );
    });

    it('should error on multiple memory connections', () => {
      const agent: WorkflowNode = {
        id: 'agent1',
        name: 'AI Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: { promptType: 'auto' }
      };

      const workflow: WorkflowJson = {
        nodes: [agent],
        connections: {
          'OpenAI': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
          },
          'Memory1': {
            'ai_memory': [[{ node: 'AI Agent', type: 'ai_memory', index: 0 }]]
          },
          'Memory2': {
            'ai_memory': [[{ node: 'AI Agent', type: 'ai_memory', index: 1 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateAIAgent(agent, reverseMap, workflow);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'MULTIPLE_MEMORY_CONNECTIONS'
        })
      );
    });

    it('should warn on high maxIterations', () => {
      const agent: WorkflowNode = {
        id: 'agent1',
        name: 'AI Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: {
          promptType: 'auto',
          maxIterations: 60  // Exceeds threshold of 50
        }
      };

      const workflow: WorkflowJson = {
        nodes: [agent],
        connections: {
          'OpenAI': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateAIAgent(agent, reverseMap, workflow);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('maxIterations')
        })
      );
    });

    it('should validate output parser with hasOutputParser flag', () => {
      const agent: WorkflowNode = {
        id: 'agent1',
        name: 'AI Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: {
          promptType: 'auto',
          hasOutputParser: true
        }
      };

      const workflow: WorkflowJson = {
        nodes: [agent],
        connections: {
          'OpenAI': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateAIAgent(agent, reverseMap, workflow);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('output parser')
        })
      );
    });
  });

  describe('validateChatTrigger', () => {
    it('should error on streaming mode to non-AI-Agent target', () => {
      const trigger: WorkflowNode = {
        id: 'chat1',
        name: 'Chat Trigger',
        type: '@n8n/n8n-nodes-langchain.chatTrigger',
        position: [0, 0],
        parameters: {
          options: { responseMode: 'streaming' }
        }
      };

      const codeNode: WorkflowNode = {
        id: 'code1',
        name: 'Code',
        type: 'n8n-nodes-base.code',
        position: [200, 0],
        parameters: {}
      };

      const workflow: WorkflowJson = {
        nodes: [trigger, codeNode],
        connections: {
          'Chat Trigger': {
            'main': [[{ node: 'Code', type: 'main', index: 0 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateChatTrigger(trigger, workflow, reverseMap);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'STREAMING_WRONG_TARGET'
        })
      );
    });

    it('should pass valid Chat Trigger with streaming to AI Agent', () => {
      const trigger: WorkflowNode = {
        id: 'chat1',
        name: 'Chat Trigger',
        type: '@n8n/n8n-nodes-langchain.chatTrigger',
        position: [0, 0],
        parameters: {
          options: { responseMode: 'streaming' }
        }
      };

      const agent: WorkflowNode = {
        id: 'agent1',
        name: 'AI Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [200, 0],
        parameters: {}
      };

      const workflow: WorkflowJson = {
        nodes: [trigger, agent],
        connections: {
          'Chat Trigger': {
            'main': [[{ node: 'AI Agent', type: 'main', index: 0 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateChatTrigger(trigger, workflow, reverseMap);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('should error on missing outgoing connections', () => {
      const trigger: WorkflowNode = {
        id: 'chat1',
        name: 'Chat Trigger',
        type: '@n8n/n8n-nodes-langchain.chatTrigger',
        position: [0, 0],
        parameters: {}
      };

      const workflow: WorkflowJson = {
        nodes: [trigger],
        connections: {}
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateChatTrigger(trigger, workflow, reverseMap);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'MISSING_CONNECTIONS'
        })
      );
    });
  });

  describe('validateBasicLLMChain', () => {
    it('should error on missing language model connection', () => {
      const chain: WorkflowNode = {
        id: 'chain1',
        name: 'LLM Chain',
        type: '@n8n/n8n-nodes-langchain.chainLlm',
        position: [0, 0],
        parameters: {}
      };

      const workflow: WorkflowJson = {
        nodes: [chain],
        connections: {}
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateBasicLLMChain(chain, reverseMap);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('language model')
        })
      );
    });

    it('should pass valid LLM Chain', () => {
      const chain: WorkflowNode = {
        id: 'chain1',
        name: 'LLM Chain',
        type: '@n8n/n8n-nodes-langchain.chainLlm',
        position: [0, 0],
        parameters: {
          prompt: 'Summarize the following text: {{$json.text}}'
        }
      };

      const workflow: WorkflowJson = {
        nodes: [chain],
        connections: {
          'OpenAI': {
            'ai_languageModel': [[{ node: 'LLM Chain', type: 'ai_languageModel', index: 0 }]]
          }
        }
      };

      const reverseMap = buildReverseConnectionMap(workflow);
      const issues = validateBasicLLMChain(chain, reverseMap);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateAISpecificNodes', () => {
    it('should validate complete AI Agent workflow', () => {
      const chatTrigger: WorkflowNode = {
        id: 'chat1',
        name: 'Chat Trigger',
        type: '@n8n/n8n-nodes-langchain.chatTrigger',
        position: [0, 0],
        parameters: {}
      };

      const agent: WorkflowNode = {
        id: 'agent1',
        name: 'AI Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [200, 0],
        parameters: {
          promptType: 'auto'
        }
      };

      const model: WorkflowNode = {
        id: 'llm1',
        name: 'OpenAI',
        type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
        position: [200, -100],
        parameters: {}
      };

      const httpTool: WorkflowNode = {
        id: 'tool1',
        name: 'Weather API',
        type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
        position: [200, 100],
        parameters: {
          toolDescription: 'Get current weather for a city',
          method: 'GET',
          url: 'https://api.weather.com/v1/current?city={city}',
          placeholderDefinitions: {
            values: [
              { name: 'city', description: 'City name' }
            ]
          }
        }
      };

      const workflow: WorkflowJson = {
        nodes: [chatTrigger, agent, model, httpTool],
        connections: {
          'Chat Trigger': {
            'main': [[{ node: 'AI Agent', type: 'main', index: 0 }]]
          },
          'OpenAI': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
          },
          'Weather API': {
            'ai_tool': [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          }
        }
      };

      const issues = validateAISpecificNodes(workflow);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('should detect missing language model in workflow', () => {
      const agent: WorkflowNode = {
        id: 'agent1',
        name: 'AI Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: {}
      };

      const workflow: WorkflowJson = {
        nodes: [agent],
        connections: {}
      };

      const issues = validateAISpecificNodes(workflow);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('language model')
        })
      );
    });

    it('should validate all AI tool sub-nodes in workflow', () => {
      const agent: WorkflowNode = {
        id: 'agent1',
        name: 'AI Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: { promptType: 'auto' }
      };

      const invalidTool: WorkflowNode = {
        id: 'tool1',
        name: 'Bad Tool',
        type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
        position: [0, 100],
        parameters: {}  // Missing toolDescription and url
      };

      const workflow: WorkflowJson = {
        nodes: [agent, invalidTool],
        connections: {
          'Model': {
            'ai_languageModel': [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]]
          },
          'Bad Tool': {
            'ai_tool': [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]]
          }
        }
      };

      const issues = validateAISpecificNodes(workflow);

      // Should have errors from missing toolDescription and url
      expect(issues.filter(i => i.severity === 'error').length).toBeGreaterThan(0);
    });
  });
});
