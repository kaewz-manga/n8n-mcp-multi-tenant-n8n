/**
 * Test fixtures for template node configurations
 * Used across unit and integration tests for P0-R3 feature
 */

import * as zlib from 'zlib';

export interface TemplateConfigFixture {
  node_type: string;
  template_id: number;
  template_name: string;
  template_views: number;
  node_name: string;
  parameters_json: string;
  credentials_json: string | null;
  has_credentials: number;
  has_expressions: number;
  complexity: 'simple' | 'medium' | 'complex';
  use_cases: string;
  rank?: number;
}

export interface WorkflowFixture {
  id: string;
  name: string;
  nodes: any[];
  connections: Record<string, any>;
  settings?: Record<string, any>;
}

/**
 * Sample node configurations for common use cases
 */
export const sampleConfigs: Record<string, TemplateConfigFixture> = {
  simpleWebhook: {
    node_type: 'n8n-nodes-base.webhook',
    template_id: 1,
    template_name: 'Simple Webhook Trigger',
    template_views: 5000,
    node_name: 'Webhook',
    parameters_json: JSON.stringify({
      httpMethod: 'POST',
      path: 'webhook',
      responseMode: 'lastNode',
      alwaysOutputData: true
    }),
    credentials_json: null,
    has_credentials: 0,
    has_expressions: 0,
    complexity: 'simple',
    use_cases: JSON.stringify(['webhook processing', 'trigger automation']),
    rank: 1
  },

  webhookWithAuth: {
    node_type: 'n8n-nodes-base.webhook',
    template_id: 2,
    template_name: 'Authenticated Webhook',
    template_views: 3000,
    node_name: 'Webhook',
    parameters_json: JSON.stringify({
      httpMethod: 'POST',
      path: 'secure-webhook',
      responseMode: 'responseNode',
      authentication: 'headerAuth'
    }),
    credentials_json: JSON.stringify({
      httpHeaderAuth: {
        id: '1',
        name: 'Header Auth'
      }
    }),
    has_credentials: 1,
    has_expressions: 0,
    complexity: 'medium',
    use_cases: JSON.stringify(['secure webhook', 'authenticated triggers']),
    rank: 2
  },

  httpRequestBasic: {
    node_type: 'n8n-nodes-base.httpRequest',
    template_id: 3,
    template_name: 'Basic HTTP GET Request',
    template_views: 10000,
    node_name: 'HTTP Request',
    parameters_json: JSON.stringify({
      url: 'https://api.example.com/data',
      method: 'GET',
      responseFormat: 'json',
      options: {
        timeout: 10000,
        redirect: {
          followRedirects: true
        }
      }
    }),
    credentials_json: null,
    has_credentials: 0,
    has_expressions: 0,
    complexity: 'simple',
    use_cases: JSON.stringify(['API calls', 'data fetching']),
    rank: 1
  },

  httpRequestWithExpressions: {
    node_type: 'n8n-nodes-base.httpRequest',
    template_id: 4,
    template_name: 'Dynamic HTTP Request',
    template_views: 7500,
    node_name: 'HTTP Request',
    parameters_json: JSON.stringify({
      url: '={{ $json.apiUrl }}',
      method: 'POST',
      sendBody: true,
      bodyParameters: {
        values: [
          {
            name: 'userId',
            value: '={{ $json.userId }}'
          },
          {
            name: 'action',
            value: '={{ $json.action }}'
          }
        ]
      },
      options: {
        timeout: '={{ $json.timeout || 10000 }}'
      }
    }),
    credentials_json: null,
    has_credentials: 0,
    has_expressions: 1,
    complexity: 'complex',
    use_cases: JSON.stringify(['dynamic API calls', 'expression-based routing']),
    rank: 2
  },

  slackMessage: {
    node_type: 'n8n-nodes-base.slack',
    template_id: 5,
    template_name: 'Send Slack Message',
    template_views: 8000,
    node_name: 'Slack',
    parameters_json: JSON.stringify({
      resource: 'message',
      operation: 'post',
      channel: '#general',
      text: 'Hello from n8n!'
    }),
    credentials_json: JSON.stringify({
      slackApi: {
        id: '2',
        name: 'Slack API'
      }
    }),
    has_credentials: 1,
    has_expressions: 0,
    complexity: 'simple',
    use_cases: JSON.stringify(['notifications', 'team communication']),
    rank: 1
  },

  codeNodeTransform: {
    node_type: 'n8n-nodes-base.code',
    template_id: 6,
    template_name: 'Data Transformation',
    template_views: 6000,
    node_name: 'Code',
    parameters_json: JSON.stringify({
      mode: 'runOnceForAllItems',
      jsCode: `const items = $input.all();

return items.map(item => ({
  json: {
    id: item.json.id,
    name: item.json.name.toUpperCase(),
    timestamp: new Date().toISOString()
  }
}));`
    }),
    credentials_json: null,
    has_credentials: 0,
    has_expressions: 0,
    complexity: 'medium',
    use_cases: JSON.stringify(['data transformation', 'custom logic']),
    rank: 1
  },

  codeNodeWithExpressions: {
    node_type: 'n8n-nodes-base.code',
    template_id: 7,
    template_name: 'Advanced Code with Expressions',
    template_views: 4500,
    node_name: 'Code',
    parameters_json: JSON.stringify({
      mode: 'runOnceForEachItem',
      jsCode: `const data = $input.item.json;
const previousNode = $('HTTP Request').first().json;

return {
  json: {
    combined: data.value + previousNode.value,
    nodeRef: $node
  }
};`
    }),
    credentials_json: null,
    has_credentials: 0,
    has_expressions: 1,
    complexity: 'complex',
    use_cases: JSON.stringify(['advanced transformations', 'node references']),
    rank: 2
  }
};

/**
 * Sample workflows for testing extraction
 */
export const sampleWorkflows: Record<string, WorkflowFixture> = {
  webhookToSlack: {
    id: '1',
    name: 'Webhook to Slack Notification',
    nodes: [
      {
        id: 'webhook1',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 1,
        position: [250, 300],
        parameters: {
          httpMethod: 'POST',
          path: 'alert',
          responseMode: 'lastNode'
        }
      },
      {
        id: 'slack1',
        name: 'Slack',
        type: 'n8n-nodes-base.slack',
        typeVersion: 1,
        position: [450, 300],
        parameters: {
          resource: 'message',
          operation: 'post',
          channel: '#alerts',
          text: '={{ $json.message }}'
        },
        credentials: {
          slackApi: {
            id: '1',
            name: 'Slack API'
          }
        }
      }
    ],
    connections: {
      webhook1: {
        main: [[{ node: 'slack1', type: 'main', index: 0 }]]
      }
    },
    settings: {}
  },

  apiWorkflow: {
    id: '2',
    name: 'API Data Processing',
    nodes: [
      {
        id: 'http1',
        name: 'Fetch Data',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 3,
        position: [250, 300],
        parameters: {
          url: 'https://api.example.com/users',
          method: 'GET',
          responseFormat: 'json'
        }
      },
      {
        id: 'code1',
        name: 'Transform',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [450, 300],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode: 'return $input.all().map(item => ({ json: { ...item.json, processed: true } }));'
        }
      },
      {
        id: 'http2',
        name: 'Send Results',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 3,
        position: [650, 300],
        parameters: {
          url: '={{ $json.callbackUrl }}',
          method: 'POST',
          sendBody: true,
          bodyParameters: {
            values: [
              { name: 'data', value: '={{ JSON.stringify($json) }}' }
            ]
          }
        }
      }
    ],
    connections: {
      http1: {
        main: [[{ node: 'code1', type: 'main', index: 0 }]]
      },
      code1: {
        main: [[{ node: 'http2', type: 'main', index: 0 }]]
      }
    },
    settings: {}
  },

  complexWorkflow: {
    id: '3',
    name: 'Complex Multi-Node Workflow',
    nodes: [
      {
        id: 'webhook1',
        name: 'Start',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 1,
        position: [100, 300],
        parameters: {
          httpMethod: 'POST',
          path: 'start'
        }
      },
      {
        id: 'sticky1',
        name: 'Note',
        type: 'n8n-nodes-base.stickyNote',
        typeVersion: 1,
        position: [100, 200],
        parameters: {
          content: 'This workflow processes incoming data'
        }
      },
      {
        id: 'if1',
        name: 'Check Type',
        type: 'n8n-nodes-base.if',
        typeVersion: 1,
        position: [300, 300],
        parameters: {
          conditions: {
            boolean: [
              {
                value1: '={{ $json.type }}',
                value2: 'premium'
              }
            ]
          }
        }
      },
      {
        id: 'http1',
        name: 'Premium API',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 3,
        position: [500, 200],
        parameters: {
          url: 'https://api.example.com/premium',
          method: 'POST'
        }
      },
      {
        id: 'http2',
        name: 'Standard API',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 3,
        position: [500, 400],
        parameters: {
          url: 'https://api.example.com/standard',
          method: 'POST'
        }
      }
    ],
    connections: {
      webhook1: {
        main: [[{ node: 'if1', type: 'main', index: 0 }]]
      },
      if1: {
        main: [
          [{ node: 'http1', type: 'main', index: 0 }],
          [{ node: 'http2', type: 'main', index: 0 }]
        ]
      }
    },
    settings: {}
  }
};

/**
 * Compress workflow to base64 (mimics n8n template format)
 */
export function compressWorkflow(workflow: WorkflowFixture): string {
  const json = JSON.stringify(workflow);
  return zlib.gzipSync(Buffer.from(json, 'utf-8')).toString('base64');
}

/**
 * Create template metadata
 */
export function createTemplateMetadata(complexity: 'simple' | 'medium' | 'complex', useCases: string[]) {
  return {
    complexity,
    use_cases: useCases
  };
}

/**
 * Batch create configs for testing
 */
export function createConfigBatch(nodeType: string, count: number): TemplateConfigFixture[] {
  return Array.from({ length: count }, (_, i) => ({
    node_type: nodeType,
    template_id: i + 1,
    template_name: `Template ${i + 1}`,
    template_views: 1000 - (i * 50),
    node_name: `Node ${i + 1}`,
    parameters_json: JSON.stringify({ index: i }),
    credentials_json: null,
    has_credentials: 0,
    has_expressions: 0,
    complexity: (['simple', 'medium', 'complex'] as const)[i % 3],
    use_cases: JSON.stringify(['test use case']),
    rank: i + 1
  }));
}

/**
 * Get config by complexity
 */
export function getConfigByComplexity(complexity: 'simple' | 'medium' | 'complex'): TemplateConfigFixture {
  const configs = Object.values(sampleConfigs);
  const match = configs.find(c => c.complexity === complexity);
  return match || configs[0];
}

/**
 * Get configs with expressions
 */
export function getConfigsWithExpressions(): TemplateConfigFixture[] {
  return Object.values(sampleConfigs).filter(c => c.has_expressions === 1);
}

/**
 * Get configs with credentials
 */
export function getConfigsWithCredentials(): TemplateConfigFixture[] {
  return Object.values(sampleConfigs).filter(c => c.has_credentials === 1);
}

/**
 * Mock database insert helper
 */
export function createInsertStatement(config: TemplateConfigFixture): string {
  return `INSERT INTO template_node_configs (
    node_type, template_id, template_name, template_views,
    node_name, parameters_json, credentials_json,
    has_credentials, has_expressions, complexity, use_cases, rank
  ) VALUES (
    '${config.node_type}',
    ${config.template_id},
    '${config.template_name}',
    ${config.template_views},
    '${config.node_name}',
    '${config.parameters_json.replace(/'/g, "''")}',
    ${config.credentials_json ? `'${config.credentials_json.replace(/'/g, "''")}'` : 'NULL'},
    ${config.has_credentials},
    ${config.has_expressions},
    '${config.complexity}',
    '${config.use_cases.replace(/'/g, "''")}',
    ${config.rank || 0}
  )`;
}
