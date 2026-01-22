/**
 * AI Validation Integration Test Helpers
 *
 * Helper functions for creating AI workflows and components for testing.
 */

import { WorkflowNode, Workflow } from '../../../src/types/n8n-api';

/**
 * Create AI Agent node
 */
export function createAIAgentNode(options: {
  id?: string;
  name?: string;
  position?: [number, number];
  promptType?: 'auto' | 'define';
  text?: string;
  systemMessage?: string;
  hasOutputParser?: boolean;
  needsFallback?: boolean;
  maxIterations?: number;
  streamResponse?: boolean;
}): WorkflowNode {
  return {
    id: options.id || 'ai-agent-1',
    name: options.name || 'AI Agent',
    type: '@n8n/n8n-nodes-langchain.agent',
    typeVersion: 1.7,
    position: options.position || [450, 300],
    parameters: {
      promptType: options.promptType || 'auto',
      text: options.text || '',
      systemMessage: options.systemMessage || '',
      hasOutputParser: options.hasOutputParser || false,
      needsFallback: options.needsFallback || false,
      maxIterations: options.maxIterations,
      options: {
        streamResponse: options.streamResponse || false
      }
    }
  };
}

/**
 * Create Chat Trigger node
 */
export function createChatTriggerNode(options: {
  id?: string;
  name?: string;
  position?: [number, number];
  responseMode?: 'lastNode' | 'streaming';
}): WorkflowNode {
  return {
    id: options.id || 'chat-trigger-1',
    name: options.name || 'Chat Trigger',
    type: '@n8n/n8n-nodes-langchain.chatTrigger',
    typeVersion: 1.1,
    position: options.position || [250, 300],
    parameters: {
      options: {
        responseMode: options.responseMode || 'lastNode'
      }
    }
  };
}

/**
 * Create Basic LLM Chain node
 */
export function createBasicLLMChainNode(options: {
  id?: string;
  name?: string;
  position?: [number, number];
  promptType?: 'auto' | 'define';
  text?: string;
}): WorkflowNode {
  return {
    id: options.id || 'llm-chain-1',
    name: options.name || 'Basic LLM Chain',
    type: '@n8n/n8n-nodes-langchain.chainLlm',
    typeVersion: 1.4,
    position: options.position || [450, 300],
    parameters: {
      promptType: options.promptType || 'auto',
      text: options.text || ''
    }
  };
}

/**
 * Create language model node
 */
export function createLanguageModelNode(
  type: 'openai' | 'anthropic' = 'openai',
  options: {
    id?: string;
    name?: string;
    position?: [number, number];
  } = {}
): WorkflowNode {
  const nodeTypes = {
    openai: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
    anthropic: '@n8n/n8n-nodes-langchain.lmChatAnthropic'
  };

  return {
    id: options.id || `${type}-model-1`,
    name: options.name || `${type === 'openai' ? 'OpenAI' : 'Anthropic'} Chat Model`,
    type: nodeTypes[type],
    typeVersion: 1,
    position: options.position || [250, 200],
    parameters: {
      model: type === 'openai' ? 'gpt-4' : 'claude-3-sonnet',
      options: {}
    },
    credentials: {
      [type === 'openai' ? 'openAiApi' : 'anthropicApi']: {
        id: '1',
        name: `${type} account`
      }
    }
  };
}

/**
 * Create HTTP Request Tool node
 */
export function createHTTPRequestToolNode(options: {
  id?: string;
  name?: string;
  position?: [number, number];
  toolDescription?: string;
  url?: string;
  method?: string;
}): WorkflowNode {
  return {
    id: options.id || 'http-tool-1',
    name: options.name || 'HTTP Request Tool',
    type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
    typeVersion: 1.1,
    position: options.position || [250, 400],
    parameters: {
      toolDescription: options.toolDescription || '',
      url: options.url || '',
      method: options.method || 'GET'
    }
  };
}

/**
 * Create Code Tool node
 */
export function createCodeToolNode(options: {
  id?: string;
  name?: string;
  position?: [number, number];
  toolDescription?: string;
  code?: string;
}): WorkflowNode {
  return {
    id: options.id || 'code-tool-1',
    name: options.name || 'Code Tool',
    type: '@n8n/n8n-nodes-langchain.toolCode',
    typeVersion: 1,
    position: options.position || [250, 400],
    parameters: {
      toolDescription: options.toolDescription || '',
      jsCode: options.code || ''
    }
  };
}

/**
 * Create Vector Store Tool node
 */
export function createVectorStoreToolNode(options: {
  id?: string;
  name?: string;
  position?: [number, number];
  toolDescription?: string;
}): WorkflowNode {
  return {
    id: options.id || 'vector-tool-1',
    name: options.name || 'Vector Store Tool',
    type: '@n8n/n8n-nodes-langchain.toolVectorStore',
    typeVersion: 1,
    position: options.position || [250, 400],
    parameters: {
      toolDescription: options.toolDescription || ''
    }
  };
}

/**
 * Create Workflow Tool node
 */
export function createWorkflowToolNode(options: {
  id?: string;
  name?: string;
  position?: [number, number];
  toolDescription?: string;
  workflowId?: string;
}): WorkflowNode {
  return {
    id: options.id || 'workflow-tool-1',
    name: options.name || 'Workflow Tool',
    type: '@n8n/n8n-nodes-langchain.toolWorkflow',
    typeVersion: 1.1,
    position: options.position || [250, 400],
    parameters: {
      toolDescription: options.toolDescription || '',
      workflowId: options.workflowId || ''
    }
  };
}

/**
 * Create Calculator Tool node
 */
export function createCalculatorToolNode(options: {
  id?: string;
  name?: string;
  position?: [number, number];
}): WorkflowNode {
  return {
    id: options.id || 'calc-tool-1',
    name: options.name || 'Calculator',
    type: '@n8n/n8n-nodes-langchain.toolCalculator',
    typeVersion: 1,
    position: options.position || [250, 400],
    parameters: {}
  };
}

/**
 * Create Memory node (Buffer Window Memory)
 */
export function createMemoryNode(options: {
  id?: string;
  name?: string;
  position?: [number, number];
  contextWindowLength?: number;
}): WorkflowNode {
  return {
    id: options.id || 'memory-1',
    name: options.name || 'Window Buffer Memory',
    type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
    typeVersion: 1.2,
    position: options.position || [250, 500],
    parameters: {
      contextWindowLength: options.contextWindowLength || 5
    }
  };
}

/**
 * Create Respond to Webhook node (for chat responses)
 */
export function createRespondNode(options: {
  id?: string;
  name?: string;
  position?: [number, number];
}): WorkflowNode {
  return {
    id: options.id || 'respond-1',
    name: options.name || 'Respond to Webhook',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: options.position || [650, 300],
    parameters: {
      respondWith: 'json',
      responseBody: '={{ $json }}'
    }
  };
}

/**
 * Create AI connection (reverse connection for langchain)
 */
export function createAIConnection(
  fromNode: string,
  toNode: string,
  connectionType: string,
  index: number = 0
): any {
  return {
    [fromNode]: {
      [connectionType]: [[{ node: toNode, type: connectionType, index }]]
    }
  };
}

/**
 * Create main connection (standard n8n flow)
 */
export function createMainConnection(
  fromNode: string,
  toNode: string,
  index: number = 0
): any {
  return {
    [fromNode]: {
      main: [[{ node: toNode, type: 'main', index }]]
    }
  };
}

/**
 * Merge multiple connection objects
 */
export function mergeConnections(...connections: any[]): any {
  const result: any = {};

  for (const conn of connections) {
    for (const [nodeName, outputs] of Object.entries(conn)) {
      if (!result[nodeName]) {
        result[nodeName] = {};
      }

      for (const [outputType, connections] of Object.entries(outputs as any)) {
        if (!result[nodeName][outputType]) {
          result[nodeName][outputType] = [];
        }
        result[nodeName][outputType].push(...(connections as any[]));
      }
    }
  }

  return result;
}

/**
 * Create a complete AI workflow
 */
export function createAIWorkflow(
  nodes: WorkflowNode[],
  connections: any,
  options: {
    name?: string;
    tags?: string[];
  } = {}
): Partial<Workflow> {
  return {
    name: options.name || 'AI Test Workflow',
    nodes,
    connections,
    settings: {
      executionOrder: 'v1'
    },
    tags: options.tags || ['mcp-integration-test']
  };
}

/**
 * Wait for n8n operations to complete
 */
export async function waitForWorkflow(workflowId: string, ms: number = 1000): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}
