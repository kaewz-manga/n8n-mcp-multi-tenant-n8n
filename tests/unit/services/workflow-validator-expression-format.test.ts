import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowValidator } from '../../../src/services/workflow-validator';
import { NodeRepository } from '../../../src/database/node-repository';
import { EnhancedConfigValidator } from '../../../src/services/enhanced-config-validator';

// Mock the database
vi.mock('../../../src/database/node-repository');

describe('WorkflowValidator - Expression Format Validation', () => {
  let validator: WorkflowValidator;
  let mockNodeRepository: any;

  beforeEach(() => {
    // Create mock repository
    mockNodeRepository = {
      findNodeByType: vi.fn().mockImplementation((type: string) => {
        // Return mock nodes for common types
        if (type === 'n8n-nodes-base.emailSend') {
          return {
            node_type: 'n8n-nodes-base.emailSend',
            display_name: 'Email Send',
            properties: {},
            version: 2.1
          };
        }
        if (type === 'n8n-nodes-base.github') {
          return {
            node_type: 'n8n-nodes-base.github',
            display_name: 'GitHub',
            properties: {},
            version: 1.1
          };
        }
        if (type === 'n8n-nodes-base.webhook') {
          return {
            node_type: 'n8n-nodes-base.webhook',
            display_name: 'Webhook',
            properties: {},
            version: 1
          };
        }
        if (type === 'n8n-nodes-base.httpRequest') {
          return {
            node_type: 'n8n-nodes-base.httpRequest',
            display_name: 'HTTP Request',
            properties: {},
            version: 4
          };
        }
        return null;
      }),
      searchNodes: vi.fn().mockReturnValue([]),
      getAllNodes: vi.fn().mockReturnValue([]),
      close: vi.fn()
    };

    validator = new WorkflowValidator(mockNodeRepository, EnhancedConfigValidator);
  });

  describe('Expression Format Detection', () => {
    it('should detect missing = prefix in simple expressions', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Send Email',
            type: 'n8n-nodes-base.emailSend',
            position: [0, 0] as [number, number],
            parameters: {
              fromEmail: '{{ $env.SENDER_EMAIL }}',
              toEmail: 'user@example.com',
              subject: 'Test Email'
            },
            typeVersion: 2.1
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      expect(result.valid).toBe(false);

      // Find expression format errors
      const formatErrors = result.errors.filter(e => e.message.includes('Expression format error'));
      expect(formatErrors).toHaveLength(1);

      const error = formatErrors[0];
      expect(error.message).toContain('Expression format error');
      expect(error.message).toContain('fromEmail');
      expect(error.message).toContain('{{ $env.SENDER_EMAIL }}');
      expect(error.message).toContain('={{ $env.SENDER_EMAIL }}');
    });

    it('should detect missing resource locator format for GitHub fields', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'GitHub',
            type: 'n8n-nodes-base.github',
            position: [0, 0] as [number, number],
            parameters: {
              operation: 'createComment',
              owner: '{{ $vars.GITHUB_OWNER }}',
              repository: '{{ $vars.GITHUB_REPO }}',
              issueNumber: 123,
              body: 'Test comment'
            },
            typeVersion: 1.1
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      // Should have errors for both owner and repository
      const ownerError = result.errors.find(e => e.message.includes('owner'));
      const repoError = result.errors.find(e => e.message.includes('repository'));

      expect(ownerError).toBeTruthy();
      expect(repoError).toBeTruthy();
      expect(ownerError?.message).toContain('resource locator format');
      expect(ownerError?.message).toContain('__rl');
    });

    it('should detect mixed content without prefix', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            position: [0, 0] as [number, number],
            parameters: {
              url: 'https://api.example.com/{{ $json.endpoint }}',
              headers: {
                Authorization: 'Bearer {{ $env.API_TOKEN }}'
              }
            },
            typeVersion: 4
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      const errors = result.errors.filter(e => e.message.includes('Expression format'));
      expect(errors.length).toBeGreaterThan(0);

      // Check for URL error
      const urlError = errors.find(e => e.message.includes('url'));
      expect(urlError).toBeTruthy();
      expect(urlError?.message).toContain('=https://api.example.com/{{ $json.endpoint }}');
    });

    it('should accept properly formatted expressions', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Send Email',
            type: 'n8n-nodes-base.emailSend',
            position: [0, 0] as [number, number],
            parameters: {
              fromEmail: '={{ $env.SENDER_EMAIL }}',
              toEmail: 'user@example.com',
              subject: '=Test {{ $json.type }}'
            },
            typeVersion: 2.1
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      // Should have no expression format errors
      const formatErrors = result.errors.filter(e => e.message.includes('Expression format'));
      expect(formatErrors).toHaveLength(0);
    });

    it('should accept resource locator format', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'GitHub',
            type: 'n8n-nodes-base.github',
            position: [0, 0] as [number, number],
            parameters: {
              operation: 'createComment',
              owner: {
                __rl: true,
                value: '={{ $vars.GITHUB_OWNER }}',
                mode: 'expression'
              },
              repository: {
                __rl: true,
                value: '={{ $vars.GITHUB_REPO }}',
                mode: 'expression'
              },
              issueNumber: 123,
              body: '=Test comment from {{ $json.author }}'
            },
            typeVersion: 1.1
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      // Should have no expression format errors
      const formatErrors = result.errors.filter(e => e.message.includes('Expression format'));
      expect(formatErrors).toHaveLength(0);
    });

    it('should validate nested expressions in complex parameters', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            position: [0, 0] as [number, number],
            parameters: {
              method: 'POST',
              url: 'https://api.example.com',
              sendBody: true,
              bodyParameters: {
                parameters: [
                  {
                    name: 'userId',
                    value: '{{ $json.id }}'
                  },
                  {
                    name: 'timestamp',
                    value: '={{ $now }}'
                  }
                ]
              }
            },
            typeVersion: 4
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      // Should detect the missing prefix in nested parameter
      const errors = result.errors.filter(e => e.message.includes('Expression format'));
      expect(errors.length).toBeGreaterThan(0);

      const nestedError = errors.find(e => e.message.includes('bodyParameters'));
      expect(nestedError).toBeTruthy();
    });

    it('should warn about RL format even with prefix', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'GitHub',
            type: 'n8n-nodes-base.github',
            position: [0, 0] as [number, number],
            parameters: {
              operation: 'createComment',
              owner: '={{ $vars.GITHUB_OWNER }}',
              repository: '={{ $vars.GITHUB_REPO }}',
              issueNumber: 123,
              body: 'Test'
            },
            typeVersion: 1.1
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      // Should have warnings about using RL format
      const warnings = result.warnings.filter(w => w.message.includes('resource locator format'));
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Real-world workflow examples', () => {
    it('should validate Email workflow with expression issues', async () => {
      const workflow = {
        name: 'Error Notification Workflow',
        nodes: [
          {
            id: 'webhook-1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            position: [250, 300] as [number, number],
            parameters: {
              path: 'error-handler',
              httpMethod: 'POST'
            },
            typeVersion: 1
          },
          {
            id: 'email-1',
            name: 'Error Handler',
            type: 'n8n-nodes-base.emailSend',
            position: [450, 300] as [number, number],
            parameters: {
              fromEmail: '{{ $env.ADMIN_EMAIL }}',
              toEmail: 'admin@company.com',
              subject: 'Error in {{ $json.workflow }}',
              message: 'An error occurred: {{ $json.error }}',
              options: {
                replyTo: '={{ $env.SUPPORT_EMAIL }}'
              }
            },
            typeVersion: 2.1
          }
        ],
        connections: {
          'Webhook': {
            main: [[{ node: 'Error Handler', type: 'main', index: 0 }]]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow);

      // Should have multiple expression format errors
      const formatErrors = result.errors.filter(e => e.message.includes('Expression format'));
      expect(formatErrors.length).toBeGreaterThanOrEqual(3); // fromEmail, subject, message

      // Check specific errors
      const fromEmailError = formatErrors.find(e => e.message.includes('fromEmail'));
      expect(fromEmailError).toBeTruthy();
      expect(fromEmailError?.message).toContain('={{ $env.ADMIN_EMAIL }}');
    });

    it('should validate GitHub workflow with resource locator issues', async () => {
      const workflow = {
        name: 'GitHub Issue Handler',
        nodes: [
          {
            id: 'webhook-1',
            name: 'Issue Webhook',
            type: 'n8n-nodes-base.webhook',
            position: [250, 300] as [number, number],
            parameters: {
              path: 'github-issue',
              httpMethod: 'POST'
            },
            typeVersion: 1
          },
          {
            id: 'github-1',
            name: 'Create Comment',
            type: 'n8n-nodes-base.github',
            position: [450, 300] as [number, number],
            parameters: {
              operation: 'createComment',
              owner: '{{ $vars.GITHUB_OWNER }}',
              repository: '{{ $vars.GITHUB_REPO }}',
              issueNumber: '={{ $json.body.issue.number }}',
              body: 'Thanks for the issue @{{ $json.body.issue.user.login }}!'
            },
            typeVersion: 1.1
          }
        ],
        connections: {
          'Issue Webhook': {
            main: [[{ node: 'Create Comment', type: 'main', index: 0 }]]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow);

      // Should have errors for owner, repository, and body
      const formatErrors = result.errors.filter(e => e.message.includes('Expression format'));
      expect(formatErrors.length).toBeGreaterThanOrEqual(3);

      // Check for resource locator suggestions
      const ownerError = formatErrors.find(e => e.message.includes('owner'));
      expect(ownerError?.message).toContain('__rl');
      expect(ownerError?.message).toContain('resource locator format');
    });

    it('should provide clear fix examples in error messages', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Process Data',
            type: 'n8n-nodes-base.httpRequest',
            position: [0, 0] as [number, number],
            parameters: {
              url: 'https://api.example.com/users/{{ $json.userId }}'
            },
            typeVersion: 4
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      const error = result.errors.find(e => e.message.includes('Expression format'));
      expect(error).toBeTruthy();

      // Error message should contain both incorrect and correct examples
      expect(error?.message).toContain('Current (incorrect):');
      expect(error?.message).toContain('"url": "https://api.example.com/users/{{ $json.userId }}"');
      expect(error?.message).toContain('Fixed (correct):');
      expect(error?.message).toContain('"url": "=https://api.example.com/users/{{ $json.userId }}"');
    });
  });

  describe('Integration with other validations', () => {
    it('should validate expression format alongside syntax', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Test Node',
            type: 'n8n-nodes-base.httpRequest',
            position: [0, 0] as [number, number],
            parameters: {
              url: '{{ $json.url',  // Syntax error: unclosed expression
              headers: {
                'X-Token': '{{ $env.TOKEN }}'  // Format error: missing prefix
              }
            },
            typeVersion: 4
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      // Should have both syntax and format errors
      const syntaxErrors = result.errors.filter(e => e.message.includes('Unmatched expression brackets'));
      const formatErrors = result.errors.filter(e => e.message.includes('Expression format'));

      expect(syntaxErrors.length).toBeGreaterThan(0);
      expect(formatErrors.length).toBeGreaterThan(0);
    });

    it('should not interfere with node validation', async () => {
      // Test that expression format validation works alongside other validations
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            position: [0, 0] as [number, number],
            parameters: {
              url: '{{ $json.endpoint }}',  // Expression format error
              headers: {
                Authorization: '={{ $env.TOKEN }}'  // Correct format
              }
            },
            typeVersion: 4
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow);

      // Should have expression format error for url field
      const formatErrors = result.errors.filter(e => e.message.includes('Expression format'));
      expect(formatErrors).toHaveLength(1);
      expect(formatErrors[0].message).toContain('url');

      // The workflow should still have structure validation (no trigger warning, etc)
      // This proves that expression validation doesn't interfere with other checks
      expect(result.warnings.some(w => w.message.includes('trigger'))).toBe(true);
    });
  });
});