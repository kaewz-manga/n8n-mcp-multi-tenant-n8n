import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as zlib from 'zlib';

/**
 * Unit tests for template configuration extraction functions
 * Testing the core logic from fetch-templates.ts
 */

// Extract the functions to test by importing or recreating them
function extractNodeConfigs(
  templateId: number,
  templateName: string,
  templateViews: number,
  workflowCompressed: string,
  metadata: any
): Array<{
  node_type: string;
  template_id: number;
  template_name: string;
  template_views: number;
  node_name: string;
  parameters_json: string;
  credentials_json: string | null;
  has_credentials: number;
  has_expressions: number;
  complexity: string;
  use_cases: string;
}> {
  try {
    const decompressed = zlib.gunzipSync(Buffer.from(workflowCompressed, 'base64'));
    const workflow = JSON.parse(decompressed.toString('utf-8'));

    const configs: any[] = [];

    for (const node of workflow.nodes || []) {
      if (node.type.includes('stickyNote') || !node.parameters) {
        continue;
      }

      configs.push({
        node_type: node.type,
        template_id: templateId,
        template_name: templateName,
        template_views: templateViews,
        node_name: node.name,
        parameters_json: JSON.stringify(node.parameters),
        credentials_json: node.credentials ? JSON.stringify(node.credentials) : null,
        has_credentials: node.credentials ? 1 : 0,
        has_expressions: detectExpressions(node.parameters) ? 1 : 0,
        complexity: metadata?.complexity || 'medium',
        use_cases: JSON.stringify(metadata?.use_cases || [])
      });
    }

    return configs;
  } catch (error) {
    return [];
  }
}

function detectExpressions(params: any): boolean {
  if (!params) return false;
  const json = JSON.stringify(params);
  return json.includes('={{') || json.includes('$json') || json.includes('$node');
}

describe('Template Configuration Extraction', () => {
  describe('extractNodeConfigs', () => {
    it('should extract configs from valid workflow with multiple nodes', () => {
      const workflow = {
        nodes: [
          {
            id: 'node1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [100, 100],
            parameters: {
              httpMethod: 'POST',
              path: 'webhook-test'
            }
          },
          {
            id: 'node2',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 3,
            position: [300, 100],
            parameters: {
              url: 'https://api.example.com',
              method: 'GET'
            }
          }
        ],
        connections: {}
      };

      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(workflow))).toString('base64');
      const metadata = {
        complexity: 'simple',
        use_cases: ['webhook processing', 'API calls']
      };

      const configs = extractNodeConfigs(1, 'Test Template', 500, compressed, metadata);

      expect(configs).toHaveLength(2);
      expect(configs[0].node_type).toBe('n8n-nodes-base.webhook');
      expect(configs[0].node_name).toBe('Webhook');
      expect(configs[0].template_id).toBe(1);
      expect(configs[0].template_name).toBe('Test Template');
      expect(configs[0].template_views).toBe(500);
      expect(configs[0].has_credentials).toBe(0);
      expect(configs[0].complexity).toBe('simple');

      const parsedParams = JSON.parse(configs[0].parameters_json);
      expect(parsedParams.httpMethod).toBe('POST');
      expect(parsedParams.path).toBe('webhook-test');

      expect(configs[1].node_type).toBe('n8n-nodes-base.httpRequest');
      expect(configs[1].node_name).toBe('HTTP Request');
    });

    it('should return empty array for workflow with no nodes', () => {
      const workflow = { nodes: [], connections: {} };
      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(workflow))).toString('base64');

      const configs = extractNodeConfigs(1, 'Empty Template', 100, compressed, null);

      expect(configs).toHaveLength(0);
    });

    it('should skip sticky note nodes', () => {
      const workflow = {
        nodes: [
          {
            id: 'sticky1',
            name: 'Note',
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [100, 100],
            parameters: { content: 'This is a note' }
          },
          {
            id: 'node1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 3,
            position: [300, 100],
            parameters: { url: 'https://api.example.com' }
          }
        ],
        connections: {}
      };

      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(workflow))).toString('base64');
      const configs = extractNodeConfigs(1, 'Test', 100, compressed, null);

      expect(configs).toHaveLength(1);
      expect(configs[0].node_type).toBe('n8n-nodes-base.httpRequest');
    });

    it('should skip nodes without parameters', () => {
      const workflow = {
        nodes: [
          {
            id: 'node1',
            name: 'No Params',
            type: 'n8n-nodes-base.someNode',
            typeVersion: 1,
            position: [100, 100]
            // No parameters field
          },
          {
            id: 'node2',
            name: 'With Params',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 3,
            position: [300, 100],
            parameters: { url: 'https://api.example.com' }
          }
        ],
        connections: {}
      };

      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(workflow))).toString('base64');
      const configs = extractNodeConfigs(1, 'Test', 100, compressed, null);

      expect(configs).toHaveLength(1);
      expect(configs[0].node_type).toBe('n8n-nodes-base.httpRequest');
    });

    it('should handle nodes with credentials', () => {
      const workflow = {
        nodes: [
          {
            id: 'node1',
            name: 'Slack',
            type: 'n8n-nodes-base.slack',
            typeVersion: 1,
            position: [100, 100],
            parameters: {
              resource: 'message',
              operation: 'post'
            },
            credentials: {
              slackApi: {
                id: '1',
                name: 'Slack API'
              }
            }
          }
        ],
        connections: {}
      };

      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(workflow))).toString('base64');
      const configs = extractNodeConfigs(1, 'Test', 100, compressed, null);

      expect(configs).toHaveLength(1);
      expect(configs[0].has_credentials).toBe(1);
      expect(configs[0].credentials_json).toBeTruthy();

      const creds = JSON.parse(configs[0].credentials_json!);
      expect(creds.slackApi).toBeDefined();
    });

    it('should use default complexity when metadata is missing', () => {
      const workflow = {
        nodes: [
          {
            id: 'node1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 3,
            position: [100, 100],
            parameters: { url: 'https://api.example.com' }
          }
        ],
        connections: {}
      };

      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(workflow))).toString('base64');
      const configs = extractNodeConfigs(1, 'Test', 100, compressed, null);

      expect(configs[0].complexity).toBe('medium');
      expect(configs[0].use_cases).toBe('[]');
    });

    it('should handle malformed compressed data gracefully', () => {
      const invalidCompressed = 'invalid-base64-data';
      const configs = extractNodeConfigs(1, 'Test', 100, invalidCompressed, null);

      expect(configs).toHaveLength(0);
    });

    it('should handle invalid JSON after decompression', () => {
      const invalidJson = 'not valid json';
      const compressed = zlib.gzipSync(Buffer.from(invalidJson)).toString('base64');
      const configs = extractNodeConfigs(1, 'Test', 100, compressed, null);

      expect(configs).toHaveLength(0);
    });

    it('should handle workflows with missing nodes array', () => {
      const workflow = { connections: {} };
      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(workflow))).toString('base64');
      const configs = extractNodeConfigs(1, 'Test', 100, compressed, null);

      expect(configs).toHaveLength(0);
    });
  });

  describe('detectExpressions', () => {
    it('should detect n8n expression syntax with ={{...}}', () => {
      const params = {
        url: '={{ $json.apiUrl }}',
        method: 'GET'
      };

      expect(detectExpressions(params)).toBe(true);
    });

    it('should detect $json references', () => {
      const params = {
        body: {
          data: '$json.data'
        }
      };

      expect(detectExpressions(params)).toBe(true);
    });

    it('should detect $node references', () => {
      const params = {
        url: 'https://api.example.com',
        headers: {
          authorization: '$node["Webhook"].json.token'
        }
      };

      expect(detectExpressions(params)).toBe(true);
    });

    it('should return false for parameters without expressions', () => {
      const params = {
        url: 'https://api.example.com',
        method: 'POST',
        body: {
          name: 'test'
        }
      };

      expect(detectExpressions(params)).toBe(false);
    });

    it('should handle nested objects with expressions', () => {
      const params = {
        options: {
          queryParameters: {
            filters: {
              id: '={{ $json.userId }}'
            }
          }
        }
      };

      expect(detectExpressions(params)).toBe(true);
    });

    it('should return false for null parameters', () => {
      expect(detectExpressions(null)).toBe(false);
    });

    it('should return false for undefined parameters', () => {
      expect(detectExpressions(undefined)).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(detectExpressions({})).toBe(false);
    });

    it('should handle array parameters with expressions', () => {
      const params = {
        items: [
          { value: '={{ $json.item1 }}' },
          { value: '={{ $json.item2 }}' }
        ]
      };

      expect(detectExpressions(params)).toBe(true);
    });

    it('should detect multiple expression types in same params', () => {
      const params = {
        url: '={{ $node["HTTP Request"].json.nextUrl }}',
        body: {
          data: '$json.data',
          token: '={{ $json.token }}'
        }
      };

      expect(detectExpressions(params)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large workflows without crashing', () => {
      const nodes = Array.from({ length: 100 }, (_, i) => ({
        id: `node${i}`,
        name: `Node ${i}`,
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 3,
        position: [100 * i, 100],
        parameters: {
          url: `https://api.example.com/${i}`,
          method: 'GET'
        }
      }));

      const workflow = { nodes, connections: {} };
      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(workflow))).toString('base64');
      const configs = extractNodeConfigs(1, 'Large Template', 1000, compressed, null);

      expect(configs).toHaveLength(100);
    });

    it('should handle special characters in node names and parameters', () => {
      const workflow = {
        nodes: [
          {
            id: 'node1',
            name: 'Node with 特殊文字 & émojis 🎉',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 3,
            position: [100, 100],
            parameters: {
              url: 'https://api.example.com?query=test&special=值',
              headers: {
                'X-Custom-Header': 'value with spaces & symbols!@#$%'
              }
            }
          }
        ],
        connections: {}
      };

      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(workflow))).toString('base64');
      const configs = extractNodeConfigs(1, 'Test', 100, compressed, null);

      expect(configs).toHaveLength(1);
      expect(configs[0].node_name).toBe('Node with 特殊文字 & émojis 🎉');

      const params = JSON.parse(configs[0].parameters_json);
      expect(params.headers['X-Custom-Header']).toBe('value with spaces & symbols!@#$%');
    });

    it('should preserve parameter structure exactly as in workflow', () => {
      const workflow = {
        nodes: [
          {
            id: 'node1',
            name: 'Complex Node',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 3,
            position: [100, 100],
            parameters: {
              url: 'https://api.example.com',
              options: {
                queryParameters: {
                  filters: [
                    { name: 'status', value: 'active' },
                    { name: 'type', value: 'user' }
                  ]
                },
                timeout: 10000,
                redirect: {
                  followRedirects: true,
                  maxRedirects: 5
                }
              }
            }
          }
        ],
        connections: {}
      };

      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(workflow))).toString('base64');
      const configs = extractNodeConfigs(1, 'Test', 100, compressed, null);

      const params = JSON.parse(configs[0].parameters_json);
      expect(params.options.queryParameters.filters).toHaveLength(2);
      expect(params.options.timeout).toBe(10000);
      expect(params.options.redirect.maxRedirects).toBe(5);
    });
  });
});
