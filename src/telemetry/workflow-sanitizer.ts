/**
 * Workflow Sanitizer
 * Removes sensitive data from workflows before telemetry storage
 */

import { createHash } from 'crypto';

interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  position: [number, number];
  parameters: any;
  credentials?: any;
  disabled?: boolean;
  typeVersion?: number;
}

interface SanitizedWorkflow {
  nodes: WorkflowNode[];
  connections: any;
  nodeCount: number;
  nodeTypes: string[];
  hasTrigger: boolean;
  hasWebhook: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  workflowHash: string;
}

interface PatternDefinition {
  pattern: RegExp;
  placeholder: string;
  preservePrefix?: boolean; // For patterns like "Bearer [REDACTED]"
}

export class WorkflowSanitizer {
  private static readonly SENSITIVE_PATTERNS: PatternDefinition[] = [
    // Webhook URLs (replace with placeholder but keep structure) - MUST BE FIRST
    { pattern: /https?:\/\/[^\s/]+\/webhook\/[^\s]+/g, placeholder: '[REDACTED_WEBHOOK]' },
    { pattern: /https?:\/\/[^\s/]+\/hook\/[^\s]+/g, placeholder: '[REDACTED_WEBHOOK]' },

    // URLs with authentication - MUST BE BEFORE BEARER TOKENS
    { pattern: /https?:\/\/[^:]+:[^@]+@[^\s/]+/g, placeholder: '[REDACTED_URL_WITH_AUTH]' },
    { pattern: /wss?:\/\/[^:]+:[^@]+@[^\s/]+/g, placeholder: '[REDACTED_URL_WITH_AUTH]' },
    { pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\s]+/g, placeholder: '[REDACTED_URL_WITH_AUTH]' }, // Database protocols - includes port and path

    // API keys and tokens - ORDER MATTERS!
    // More specific patterns first, then general patterns
    { pattern: /sk-[a-zA-Z0-9]{16,}/g, placeholder: '[REDACTED_APIKEY]' }, // OpenAI keys
    { pattern: /Bearer\s+[^\s]+/gi, placeholder: 'Bearer [REDACTED]', preservePrefix: true }, // Bearer tokens
    { pattern: /\b[a-zA-Z0-9_-]{32,}\b/g, placeholder: '[REDACTED_TOKEN]' }, // Long tokens (32+ chars)
    { pattern: /\b[a-zA-Z0-9_-]{20,31}\b/g, placeholder: '[REDACTED]' }, // Short tokens (20-31 chars)

    // Email addresses (optional - uncomment if needed)
    // { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, placeholder: '[REDACTED_EMAIL]' },
  ];

  private static readonly SENSITIVE_FIELDS = [
    'apiKey',
    'api_key',
    'token',
    'secret',
    'password',
    'credential',
    'auth',
    'authorization',
    'webhook',
    'webhookUrl',
    'url',
    'endpoint',
    'host',
    'server',
    'database',
    'connectionString',
    'privateKey',
    'publicKey',
    'certificate',
  ];

  /**
   * Sanitize a complete workflow
   */
  static sanitizeWorkflow(workflow: any): SanitizedWorkflow {
    // Create a deep copy to avoid modifying original
    const sanitized = JSON.parse(JSON.stringify(workflow));

    // Sanitize nodes
    if (sanitized.nodes && Array.isArray(sanitized.nodes)) {
      sanitized.nodes = sanitized.nodes.map((node: WorkflowNode) =>
        this.sanitizeNode(node)
      );
    }

    // Sanitize connections (keep structure only)
    if (sanitized.connections) {
      sanitized.connections = this.sanitizeConnections(sanitized.connections);
    }

    // Remove other potentially sensitive data
    delete sanitized.settings?.errorWorkflow;
    delete sanitized.staticData;
    delete sanitized.pinData;
    delete sanitized.credentials;
    delete sanitized.sharedWorkflows;
    delete sanitized.ownedBy;
    delete sanitized.createdBy;
    delete sanitized.updatedBy;

    // Calculate metrics
    const nodeTypes = sanitized.nodes?.map((n: WorkflowNode) => n.type) || [];
    const uniqueNodeTypes = [...new Set(nodeTypes)] as string[];

    const hasTrigger = nodeTypes.some((type: string) =>
      type.includes('trigger') || type.includes('webhook')
    );

    const hasWebhook = nodeTypes.some((type: string) =>
      type.includes('webhook')
    );

    // Calculate complexity
    const nodeCount = sanitized.nodes?.length || 0;
    let complexity: 'simple' | 'medium' | 'complex' = 'simple';
    if (nodeCount > 20) {
      complexity = 'complex';
    } else if (nodeCount > 10) {
      complexity = 'medium';
    }

    // Generate workflow hash (for deduplication)
    const workflowStructure = JSON.stringify({
      nodeTypes: uniqueNodeTypes.sort(),
      connections: sanitized.connections
    });
    const workflowHash = createHash('sha256')
      .update(workflowStructure)
      .digest('hex')
      .substring(0, 16);

    return {
      nodes: sanitized.nodes || [],
      connections: sanitized.connections || {},
      nodeCount,
      nodeTypes: uniqueNodeTypes,
      hasTrigger,
      hasWebhook,
      complexity,
      workflowHash
    };
  }

  /**
   * Sanitize a single node
   */
  private static sanitizeNode(node: WorkflowNode): WorkflowNode {
    const sanitized = { ...node };

    // Remove credentials entirely
    delete sanitized.credentials;

    // Sanitize parameters
    if (sanitized.parameters) {
      sanitized.parameters = this.sanitizeObject(sanitized.parameters);
    }

    return sanitized;
  }

  /**
   * Recursively sanitize an object
   */
  private static sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: any = {};

    for (const [key, value] of Object.entries(obj)) {
      // Check if field name is sensitive
      const isSensitive = this.isSensitiveField(key);
      const isUrlField = key.toLowerCase().includes('url') ||
                         key.toLowerCase().includes('endpoint') ||
                         key.toLowerCase().includes('webhook');

      // Recursively sanitize nested objects (unless it's a sensitive non-URL field)
      if (typeof value === 'object' && value !== null) {
        if (isSensitive && !isUrlField) {
          // For sensitive object fields (like 'authentication'), redact completely
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeObject(value);
        }
      }
      // Sanitize string values
      else if (typeof value === 'string') {
        // For sensitive fields (except URL fields), use generic redaction
        if (isSensitive && !isUrlField) {
          sanitized[key] = '[REDACTED]';
        } else {
          // For URL fields or non-sensitive fields, use pattern-specific sanitization
          sanitized[key] = this.sanitizeString(value, key);
        }
      }
      // For non-string sensitive fields, redact completely
      else if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      }
      // Keep other types as-is
      else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize string values
   */
  private static sanitizeString(value: string, fieldName: string): string {
    // First check if this is a webhook URL
    if (value.includes('/webhook/') || value.includes('/hook/')) {
      return 'https://[webhook-url]';
    }

    let sanitized = value;

    // Apply all sensitive patterns with their specific placeholders
    for (const patternDef of this.SENSITIVE_PATTERNS) {
      // Skip webhook patterns - already handled above
      if (patternDef.placeholder.includes('WEBHOOK')) {
        continue;
      }

      // Skip if already sanitized with a placeholder to prevent double-redaction
      if (sanitized.includes('[REDACTED')) {
        break;
      }

      // Special handling for URL with auth - preserve path after credentials
      if (patternDef.placeholder === '[REDACTED_URL_WITH_AUTH]') {
        const matches = value.match(patternDef.pattern);
        if (matches) {
          for (const match of matches) {
            // Extract path after the authenticated URL
            const fullUrlMatch = value.indexOf(match);
            if (fullUrlMatch !== -1) {
              const afterUrl = value.substring(fullUrlMatch + match.length);
              // If there's a path after the URL, preserve it
              if (afterUrl && afterUrl.startsWith('/')) {
                const pathPart = afterUrl.split(/[\s?&#]/)[0]; // Get path until query/fragment
                sanitized = sanitized.replace(match + pathPart, patternDef.placeholder + pathPart);
              } else {
                sanitized = sanitized.replace(match, patternDef.placeholder);
              }
            }
          }
        }
        continue;
      }

      // Apply pattern with its specific placeholder
      sanitized = sanitized.replace(patternDef.pattern, patternDef.placeholder);
    }

    // Additional sanitization for specific field types
    if (fieldName.toLowerCase().includes('url') ||
        fieldName.toLowerCase().includes('endpoint')) {
      // Keep URL structure but remove domain details
      if (sanitized.startsWith('http://') || sanitized.startsWith('https://')) {
        // If value has been redacted with URL_WITH_AUTH, preserve it
        if (sanitized.includes('[REDACTED_URL_WITH_AUTH]')) {
          return sanitized; // Already properly sanitized with path preserved
        }
        // If value has other redactions, leave it as is
        if (sanitized.includes('[REDACTED]')) {
          return sanitized;
        }
        const urlParts = sanitized.split('/');
        if (urlParts.length > 2) {
          urlParts[2] = '[domain]';
          sanitized = urlParts.join('/');
        }
      }
    }

    return sanitized;
  }

  /**
   * Check if a field name is sensitive
   */
  private static isSensitiveField(fieldName: string): boolean {
    const lowerFieldName = fieldName.toLowerCase();
    return this.SENSITIVE_FIELDS.some(sensitive =>
      lowerFieldName.includes(sensitive.toLowerCase())
    );
  }

  /**
   * Sanitize connections (keep structure only)
   */
  private static sanitizeConnections(connections: any): any {
    if (!connections || typeof connections !== 'object') {
      return connections;
    }

    const sanitized: any = {};

    for (const [nodeId, nodeConnections] of Object.entries(connections)) {
      if (typeof nodeConnections === 'object' && nodeConnections !== null) {
        sanitized[nodeId] = {};

        for (const [connType, connArray] of Object.entries(nodeConnections as any)) {
          if (Array.isArray(connArray)) {
            sanitized[nodeId][connType] = connArray.map((conns: any) => {
              if (Array.isArray(conns)) {
                return conns.map((conn: any) => ({
                  node: conn.node,
                  type: conn.type,
                  index: conn.index
                }));
              }
              return conns;
            });
          } else {
            sanitized[nodeId][connType] = connArray;
          }
        }
      } else {
        sanitized[nodeId] = nodeConnections;
      }
    }

    return sanitized;
  }

  /**
   * Generate a hash for workflow deduplication
   */
  static generateWorkflowHash(workflow: any): string {
    const sanitized = this.sanitizeWorkflow(workflow);
    return sanitized.workflowHash;
  }

  /**
   * Sanitize workflow and return raw workflow object (without metrics)
   * For use in telemetry where we need plain workflow structure
   */
  static sanitizeWorkflowRaw(workflow: any): any {
    // Create a deep copy to avoid modifying original
    const sanitized = JSON.parse(JSON.stringify(workflow));

    // Sanitize nodes
    if (sanitized.nodes && Array.isArray(sanitized.nodes)) {
      sanitized.nodes = sanitized.nodes.map((node: WorkflowNode) =>
        this.sanitizeNode(node)
      );
    }

    // Sanitize connections (keep structure only)
    if (sanitized.connections) {
      sanitized.connections = this.sanitizeConnections(sanitized.connections);
    }

    // Remove other potentially sensitive data
    delete sanitized.settings?.errorWorkflow;
    delete sanitized.staticData;
    delete sanitized.pinData;
    delete sanitized.credentials;
    delete sanitized.sharedWorkflows;
    delete sanitized.ownedBy;
    delete sanitized.createdBy;
    delete sanitized.updatedBy;

    return sanitized;
  }
}