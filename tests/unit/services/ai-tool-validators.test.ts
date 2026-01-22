import { describe, it, expect } from 'vitest';
import {
  validateHTTPRequestTool,
  validateCodeTool,
  validateVectorStoreTool,
  validateWorkflowTool,
  validateAIAgentTool,
  validateMCPClientTool,
  validateCalculatorTool,
  validateThinkTool,
  validateSerpApiTool,
  validateWikipediaTool,
  validateSearXngTool,
  validateWolframAlphaTool,
  type WorkflowNode
} from '@/services/ai-tool-validators';

describe('AI Tool Validators', () => {
  describe('validateHTTPRequestTool', () => {
    it('should error on missing toolDescription', () => {
      const node: WorkflowNode = {
        id: 'http1',
        name: 'Weather API',
        type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
        position: [0, 0],
        parameters: {
          method: 'GET',
          url: 'https://api.weather.com/data'
        }
      };

      const issues = validateHTTPRequestTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'MISSING_TOOL_DESCRIPTION'
        })
      );
    });

    it('should warn on short toolDescription', () => {
      const node: WorkflowNode = {
        id: 'http1',
        name: 'Weather API',
        type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
        position: [0, 0],
        parameters: {
          method: 'GET',
          url: 'https://api.weather.com/data',
          toolDescription: 'Weather'  // Too short (7 chars, need 15)
        }
      };

      const issues = validateHTTPRequestTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('toolDescription is too short')
        })
      );
    });

    it('should error on missing URL', () => {
      const node: WorkflowNode = {
        id: 'http1',
        name: 'API Tool',
        type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
        position: [0, 0],
        parameters: {
          toolDescription: 'Fetches data from an API endpoint',
          method: 'GET'
        }
      };

      const issues = validateHTTPRequestTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'MISSING_URL'
        })
      );
    });

    it('should error on invalid URL protocol', () => {
      const node: WorkflowNode = {
        id: 'http1',
        name: 'FTP Tool',
        type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
        position: [0, 0],
        parameters: {
          toolDescription: 'Downloads files via FTP',
          url: 'ftp://files.example.com/data.txt'
        }
      };

      const issues = validateHTTPRequestTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'INVALID_URL_PROTOCOL'
        })
      );
    });

    it('should allow expressions in URL', () => {
      const node: WorkflowNode = {
        id: 'http1',
        name: 'Dynamic API',
        type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
        position: [0, 0],
        parameters: {
          toolDescription: 'Fetches data from dynamic endpoint',
          url: '={{$json.apiUrl}}/users'
        }
      };

      const issues = validateHTTPRequestTool(node);

      // Should not error on URL format when it contains expressions
      const urlErrors = issues.filter(i => i.code === 'INVALID_URL_FORMAT');
      expect(urlErrors).toHaveLength(0);
    });

    it('should warn on missing placeholderDefinitions for parameterized URL', () => {
      const node: WorkflowNode = {
        id: 'http1',
        name: 'User API',
        type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
        position: [0, 0],
        parameters: {
          toolDescription: 'Fetches user data by ID',
          url: 'https://api.example.com/users/{userId}'
        }
      };

      const issues = validateHTTPRequestTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('placeholderDefinitions')
        })
      );
    });

    it('should validate placeholder definitions match URL', () => {
      const node: WorkflowNode = {
        id: 'http1',
        name: 'User API',
        type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
        position: [0, 0],
        parameters: {
          toolDescription: 'Fetches user data',
          url: 'https://api.example.com/users/{userId}',
          placeholderDefinitions: {
            values: [
              { name: 'wrongName', description: 'User identifier' }
            ]
          }
        }
      };

      const issues = validateHTTPRequestTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('Placeholder "userId" in URL')
        })
      );
    });

    it('should pass valid HTTP Request Tool configuration', () => {
      const node: WorkflowNode = {
        id: 'http1',
        name: 'Weather API',
        type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
        position: [0, 0],
        parameters: {
          toolDescription: 'Get current weather conditions for a specified city',
          method: 'GET',
          url: 'https://api.weather.com/v1/current?city={city}',
          placeholderDefinitions: {
            values: [
              { name: 'city', description: 'City name (e.g. London, Tokyo)' }
            ]
          }
        }
      };

      const issues = validateHTTPRequestTool(node);

      // Should have no errors
      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateCodeTool', () => {
    it('should error on missing toolDescription', () => {
      const node: WorkflowNode = {
        id: 'code1',
        name: 'Calculate Tax',
        type: '@n8n/n8n-nodes-langchain.toolCode',
        position: [0, 0],
        parameters: {
          language: 'javaScript',
          jsCode: 'return { tax: price * 0.1 };'
        }
      };

      const issues = validateCodeTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'MISSING_TOOL_DESCRIPTION'
        })
      );
    });

    it('should error on missing code', () => {
      const node: WorkflowNode = {
        id: 'code1',
        name: 'Empty Code',
        type: '@n8n/n8n-nodes-langchain.toolCode',
        position: [0, 0],
        parameters: {
          toolDescription: 'Performs calculations',
          language: 'javaScript'
        }
      };

      const issues = validateCodeTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('code is empty')
        })
      );
    });

    it('should warn on missing schema for outputs', () => {
      const node: WorkflowNode = {
        id: 'code1',
        name: 'Calculate',
        type: '@n8n/n8n-nodes-langchain.toolCode',
        position: [0, 0],
        parameters: {
          toolDescription: 'Calculates shipping cost based on weight and distance',
          language: 'javaScript',
          jsCode: 'return { cost: weight * distance * 0.5 };'
        }
      };

      const issues = validateCodeTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('schema')
        })
      );
    });

    it('should pass valid Code Tool configuration', () => {
      const node: WorkflowNode = {
        id: 'code1',
        name: 'Shipping Calculator',
        type: '@n8n/n8n-nodes-langchain.toolCode',
        position: [0, 0],
        parameters: {
          toolDescription: 'Calculates shipping cost based on weight (kg) and distance (km)',
          language: 'javaScript',
          jsCode: `const { weight, distance } = $input;
const baseCost = 5.00;
const costPerKg = 2.50;
const costPerKm = 0.15;
const cost = baseCost + (weight * costPerKg) + (distance * costPerKm);
return { cost: cost.toFixed(2) };`,
          specifyInputSchema: true,
          inputSchema: '{ "weight": "number", "distance": "number" }'
        }
      };

      const issues = validateCodeTool(node);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateVectorStoreTool', () => {
    it('should error on missing toolDescription', () => {
      const node: WorkflowNode = {
        id: 'vector1',
        name: 'Product Search',
        type: '@n8n/n8n-nodes-langchain.toolVectorStore',
        position: [0, 0],
        parameters: {
          topK: 5
        }
      };

      const reverseMap = new Map();
      const workflow = { nodes: [node], connections: {} };
      const issues = validateVectorStoreTool(node, reverseMap, workflow);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'MISSING_TOOL_DESCRIPTION'
        })
      );
    });

    it('should warn on high topK value', () => {
      const node: WorkflowNode = {
        id: 'vector1',
        name: 'Document Search',
        type: '@n8n/n8n-nodes-langchain.toolVectorStore',
        position: [0, 0],
        parameters: {
          toolDescription: 'Search through product documentation',
          topK: 25  // Exceeds threshold of 20
        }
      };

      const reverseMap = new Map();
      const workflow = { nodes: [node], connections: {} };
      const issues = validateVectorStoreTool(node, reverseMap, workflow);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('topK')
        })
      );
    });

    it('should pass valid Vector Store Tool configuration', () => {
      const node: WorkflowNode = {
        id: 'vector1',
        name: 'Knowledge Base',
        type: '@n8n/n8n-nodes-langchain.toolVectorStore',
        position: [0, 0],
        parameters: {
          toolDescription: 'Search company knowledge base for relevant documentation',
          topK: 5
        }
      };

      const reverseMap = new Map();
      const workflow = { nodes: [node], connections: {} };
      const issues = validateVectorStoreTool(node, reverseMap, workflow);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateWorkflowTool', () => {
    it('should error on missing toolDescription', () => {
      const node: WorkflowNode = {
        id: 'workflow1',
        name: 'Approval Process',
        type: '@n8n/n8n-nodes-langchain.toolWorkflow',
        position: [0, 0],
        parameters: {}
      };

      const reverseMap = new Map();
      const issues = validateWorkflowTool(node, reverseMap);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'MISSING_TOOL_DESCRIPTION'
        })
      );
    });

    it('should error on missing workflowId', () => {
      const node: WorkflowNode = {
        id: 'workflow1',
        name: 'Data Processor',
        type: '@n8n/n8n-nodes-langchain.toolWorkflow',
        position: [0, 0],
        parameters: {
          toolDescription: 'Process data through specialized workflow'
        }
      };

      const reverseMap = new Map();
      const issues = validateWorkflowTool(node, reverseMap);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('workflowId')
        })
      );
    });

    it('should pass valid Workflow Tool configuration', () => {
      const node: WorkflowNode = {
        id: 'workflow1',
        name: 'Email Approval',
        type: '@n8n/n8n-nodes-langchain.toolWorkflow',
        position: [0, 0],
        parameters: {
          toolDescription: 'Send email and wait for approval response',
          workflowId: '123'
        }
      };

      const reverseMap = new Map();
      const issues = validateWorkflowTool(node, reverseMap);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateAIAgentTool', () => {
    it('should error on missing toolDescription', () => {
      const node: WorkflowNode = {
        id: 'agent1',
        name: 'Research Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: {}
      };

      const reverseMap = new Map();
      const issues = validateAIAgentTool(node, reverseMap);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'MISSING_TOOL_DESCRIPTION'
        })
      );
    });

    it('should warn on high maxIterations', () => {
      const node: WorkflowNode = {
        id: 'agent1',
        name: 'Complex Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: {
          toolDescription: 'Performs complex research tasks',
          maxIterations: 60  // Exceeds threshold of 50
        }
      };

      const reverseMap = new Map();
      const issues = validateAIAgentTool(node, reverseMap);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('maxIterations')
        })
      );
    });

    it('should pass valid AI Agent Tool configuration', () => {
      const node: WorkflowNode = {
        id: 'agent1',
        name: 'Research Specialist',
        type: '@n8n/n8n-nodes-langchain.agent',
        position: [0, 0],
        parameters: {
          toolDescription: 'Specialist agent for conducting in-depth research on technical topics',
          maxIterations: 10
        }
      };

      const reverseMap = new Map();
      const issues = validateAIAgentTool(node, reverseMap);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateMCPClientTool', () => {
    it('should error on missing toolDescription', () => {
      const node: WorkflowNode = {
        id: 'mcp1',
        name: 'File Access',
        type: '@n8n/n8n-nodes-langchain.mcpClientTool',
        position: [0, 0],
        parameters: {
          serverUrl: 'mcp://filesystem'
        }
      };

      const issues = validateMCPClientTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'MISSING_TOOL_DESCRIPTION'
        })
      );
    });

    it('should error on missing serverUrl', () => {
      const node: WorkflowNode = {
        id: 'mcp1',
        name: 'MCP Tool',
        type: '@n8n/n8n-nodes-langchain.mcpClientTool',
        position: [0, 0],
        parameters: {
          toolDescription: 'Access external MCP server'
        }
      };

      const issues = validateMCPClientTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('serverUrl')
        })
      );
    });

    it('should pass valid MCP Client Tool configuration', () => {
      const node: WorkflowNode = {
        id: 'mcp1',
        name: 'Filesystem Access',
        type: '@n8n/n8n-nodes-langchain.mcpClientTool',
        position: [0, 0],
        parameters: {
          toolDescription: 'Read and write files in the local filesystem',
          serverUrl: 'mcp://filesystem'
        }
      };

      const issues = validateMCPClientTool(node);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateCalculatorTool', () => {
    it('should not require toolDescription (has built-in description)', () => {
      const node: WorkflowNode = {
        id: 'calc1',
        name: 'Math Operations',
        type: '@n8n/n8n-nodes-langchain.toolCalculator',
        position: [0, 0],
        parameters: {}
      };

      const issues = validateCalculatorTool(node);

      // Calculator Tool has built-in description, no validation needed
      expect(issues).toHaveLength(0);
    });

    it('should pass valid Calculator Tool configuration', () => {
      const node: WorkflowNode = {
        id: 'calc1',
        name: 'Calculator',
        type: '@n8n/n8n-nodes-langchain.toolCalculator',
        position: [0, 0],
        parameters: {
          toolDescription: 'Perform mathematical calculations and solve equations'
        }
      };

      const issues = validateCalculatorTool(node);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateThinkTool', () => {
    it('should not require toolDescription (has built-in description)', () => {
      const node: WorkflowNode = {
        id: 'think1',
        name: 'Think',
        type: '@n8n/n8n-nodes-langchain.toolThink',
        position: [0, 0],
        parameters: {}
      };

      const issues = validateThinkTool(node);

      // Think Tool has built-in description, no validation needed
      expect(issues).toHaveLength(0);
    });

    it('should pass valid Think Tool configuration', () => {
      const node: WorkflowNode = {
        id: 'think1',
        name: 'Think',
        type: '@n8n/n8n-nodes-langchain.toolThink',
        position: [0, 0],
        parameters: {
          toolDescription: 'Pause and think through complex problems step by step'
        }
      };

      const issues = validateThinkTool(node);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateSerpApiTool', () => {
    it('should error on missing toolDescription', () => {
      const node: WorkflowNode = {
        id: 'serp1',
        name: 'Web Search',
        type: '@n8n/n8n-nodes-langchain.toolSerpapi',
        position: [0, 0],
        parameters: {}
      };

      const issues = validateSerpApiTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'MISSING_TOOL_DESCRIPTION'
        })
      );
    });

    it('should warn on missing credentials', () => {
      const node: WorkflowNode = {
        id: 'serp1',
        name: 'Search Engine',
        type: '@n8n/n8n-nodes-langchain.toolSerpapi',
        position: [0, 0],
        parameters: {
          toolDescription: 'Search the web for current information'
        }
      };

      const issues = validateSerpApiTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('credentials')
        })
      );
    });

    it('should pass valid SerpApi Tool configuration', () => {
      const node: WorkflowNode = {
        id: 'serp1',
        name: 'Web Search',
        type: '@n8n/n8n-nodes-langchain.toolSerpapi',
        position: [0, 0],
        parameters: {
          toolDescription: 'Search Google for current web information and news'
        },
        credentials: {
          serpApiApi: 'serpapi-credentials'
        }
      };

      const issues = validateSerpApiTool(node);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateWikipediaTool', () => {
    it('should error on missing toolDescription', () => {
      const node: WorkflowNode = {
        id: 'wiki1',
        name: 'Wiki Lookup',
        type: '@n8n/n8n-nodes-langchain.toolWikipedia',
        position: [0, 0],
        parameters: {}
      };

      const issues = validateWikipediaTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'MISSING_TOOL_DESCRIPTION'
        })
      );
    });

    it('should pass valid Wikipedia Tool configuration', () => {
      const node: WorkflowNode = {
        id: 'wiki1',
        name: 'Wikipedia',
        type: '@n8n/n8n-nodes-langchain.toolWikipedia',
        position: [0, 0],
        parameters: {
          toolDescription: 'Look up factual information from Wikipedia articles'
        }
      };

      const issues = validateWikipediaTool(node);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateSearXngTool', () => {
    it('should error on missing toolDescription', () => {
      const node: WorkflowNode = {
        id: 'searx1',
        name: 'Privacy Search',
        type: '@n8n/n8n-nodes-langchain.toolSearxng',
        position: [0, 0],
        parameters: {}
      };

      const issues = validateSearXngTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'MISSING_TOOL_DESCRIPTION'
        })
      );
    });

    it('should error on missing baseUrl', () => {
      const node: WorkflowNode = {
        id: 'searx1',
        name: 'SearXNG',
        type: '@n8n/n8n-nodes-langchain.toolSearxng',
        position: [0, 0],
        parameters: {
          toolDescription: 'Private web search through SearXNG instance'
        }
      };

      const issues = validateSearXngTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('baseUrl')
        })
      );
    });

    it('should pass valid SearXNG Tool configuration', () => {
      const node: WorkflowNode = {
        id: 'searx1',
        name: 'SearXNG',
        type: '@n8n/n8n-nodes-langchain.toolSearxng',
        position: [0, 0],
        parameters: {
          toolDescription: 'Privacy-focused web search through self-hosted SearXNG',
          baseUrl: 'https://searx.example.com'
        }
      };

      const issues = validateSearXngTool(node);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateWolframAlphaTool', () => {
    it('should error on missing credentials', () => {
      const node: WorkflowNode = {
        id: 'wolfram1',
        name: 'Computational Knowledge',
        type: '@n8n/n8n-nodes-langchain.toolWolframAlpha',
        position: [0, 0],
        parameters: {}
      };

      const issues = validateWolframAlphaTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'MISSING_CREDENTIALS'
        })
      );
    });

    it('should provide info on missing custom description', () => {
      const node: WorkflowNode = {
        id: 'wolfram1',
        name: 'WolframAlpha',
        type: '@n8n/n8n-nodes-langchain.toolWolframAlpha',
        position: [0, 0],
        parameters: {},
        credentials: {
          wolframAlpha: 'wolfram-credentials'
        }
      };

      const issues = validateWolframAlphaTool(node);

      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'info',
          message: expect.stringContaining('description')
        })
      );
    });

    it('should pass valid WolframAlpha Tool configuration', () => {
      const node: WorkflowNode = {
        id: 'wolfram1',
        name: 'WolframAlpha',
        type: '@n8n/n8n-nodes-langchain.toolWolframAlpha',
        position: [0, 0],
        parameters: {
          toolDescription: 'Computational knowledge engine for math, science, and factual queries'
        },
        credentials: {
          wolframAlphaApi: 'wolfram-credentials'
        }
      };

      const issues = validateWolframAlphaTool(node);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });
});
