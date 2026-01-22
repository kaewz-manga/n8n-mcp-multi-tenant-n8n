/**
 * Universal Node Type Normalizer - FOR DATABASE OPERATIONS ONLY
 *
 * ⚠️ WARNING: Do NOT use before n8n API calls!
 *
 * This class converts node types to SHORT form (database format).
 * The n8n API requires FULL form (n8n-nodes-base.*).
 *
 * **Use this ONLY when:**
 * - Querying the node database
 * - Searching for node information
 * - Looking up node metadata
 *
 * **Do NOT use before:**
 * - Creating workflows (n8n_create_workflow)
 * - Updating workflows (n8n_update_workflow)
 * - Any n8n API calls
 *
 * **IMPORTANT:** The n8n-mcp database stores nodes in SHORT form:
 * - n8n-nodes-base → nodes-base
 * - @n8n/n8n-nodes-langchain → nodes-langchain
 *
 * But the n8n API requires FULL form:
 * - nodes-base → n8n-nodes-base
 * - nodes-langchain → @n8n/n8n-nodes-langchain
 *
 * @example Database Lookup (CORRECT usage)
 * const dbType = NodeTypeNormalizer.normalizeToFullForm('n8n-nodes-base.webhook')
 * // → 'nodes-base.webhook'
 * const node = await repository.getNode(dbType)
 *
 * @example API Call (INCORRECT - Do NOT do this!)
 * const workflow = { nodes: [{ type: 'n8n-nodes-base.webhook' }] }
 * const normalized = NodeTypeNormalizer.normalizeWorkflowNodeTypes(workflow)
 * // ❌ WRONG! normalized has SHORT form, API needs FULL form
 * await client.createWorkflow(normalized) // FAILS!
 *
 * @example API Call (CORRECT)
 * const workflow = { nodes: [{ type: 'n8n-nodes-base.webhook' }] }
 * // ✅ Send as-is to API (FULL form required)
 * await client.createWorkflow(workflow) // WORKS!
 */

export interface NodeTypeNormalizationResult {
  original: string;
  normalized: string;
  wasNormalized: boolean;
  package: 'base' | 'langchain' | 'community' | 'unknown';
}

export class NodeTypeNormalizer {
  /**
   * Normalize node type to canonical SHORT form (database format)
   *
   * This is the PRIMARY method to use throughout the codebase.
   * It converts any node type variation to the SHORT form that the database uses.
   *
   * **NOTE:** Method name says "ToFullForm" for backward compatibility,
   * but actually normalizes TO SHORT form to match database storage.
   *
   * @param type - Node type in any format
   * @returns Normalized node type in short form (database format)
   *
   * @example
   * normalizeToFullForm('n8n-nodes-base.webhook')
   * // → 'nodes-base.webhook'
   *
   * @example
   * normalizeToFullForm('nodes-base.webhook')
   * // → 'nodes-base.webhook' (unchanged)
   *
   * @example
   * normalizeToFullForm('@n8n/n8n-nodes-langchain.agent')
   * // → 'nodes-langchain.agent'
   */
  static normalizeToFullForm(type: string): string {
    if (!type || typeof type !== 'string') {
      return type;
    }

    // Normalize full forms to short form (database format)
    if (type.startsWith('n8n-nodes-base.')) {
      return type.replace(/^n8n-nodes-base\./, 'nodes-base.');
    }
    if (type.startsWith('@n8n/n8n-nodes-langchain.')) {
      return type.replace(/^@n8n\/n8n-nodes-langchain\./, 'nodes-langchain.');
    }
    // Handle n8n-nodes-langchain without @n8n/ prefix
    if (type.startsWith('n8n-nodes-langchain.')) {
      return type.replace(/^n8n-nodes-langchain\./, 'nodes-langchain.');
    }

    // Already in short form or community node - return unchanged
    return type;
  }

  /**
   * Normalize with detailed result including metadata
   *
   * Use this when you need to know if normalization occurred
   * or what package the node belongs to.
   *
   * @param type - Node type in any format
   * @returns Detailed normalization result
   *
   * @example
   * normalizeWithDetails('nodes-base.webhook')
   * // → {
   * //   original: 'nodes-base.webhook',
   * //   normalized: 'n8n-nodes-base.webhook',
   * //   wasNormalized: true,
   * //   package: 'base'
   * // }
   */
  static normalizeWithDetails(type: string): NodeTypeNormalizationResult {
    const original = type;
    const normalized = this.normalizeToFullForm(type);

    return {
      original,
      normalized,
      wasNormalized: original !== normalized,
      package: this.detectPackage(normalized)
    };
  }

  /**
   * Detect package type from node type
   *
   * @param type - Node type (in any form)
   * @returns Package identifier
   */
  private static detectPackage(type: string): 'base' | 'langchain' | 'community' | 'unknown' {
    // Check both short and full forms
    if (type.startsWith('nodes-base.') || type.startsWith('n8n-nodes-base.')) return 'base';
    if (type.startsWith('nodes-langchain.') || type.startsWith('@n8n/n8n-nodes-langchain.') || type.startsWith('n8n-nodes-langchain.')) return 'langchain';
    if (type.includes('.')) return 'community';
    return 'unknown';
  }

  /**
   * Batch normalize multiple node types
   *
   * Use this when you need to normalize multiple types at once.
   *
   * @param types - Array of node types
   * @returns Map of original → normalized types
   *
   * @example
   * normalizeBatch(['nodes-base.webhook', 'nodes-base.set'])
   * // → Map {
   * //   'nodes-base.webhook' => 'n8n-nodes-base.webhook',
   * //   'nodes-base.set' => 'n8n-nodes-base.set'
   * // }
   */
  static normalizeBatch(types: string[]): Map<string, string> {
    const result = new Map<string, string>();
    for (const type of types) {
      result.set(type, this.normalizeToFullForm(type));
    }
    return result;
  }

  /**
   * Normalize all node types in a workflow
   *
   * This is the key method for fixing workflows before validation.
   * It normalizes all node types in place while preserving all other
   * workflow properties.
   *
   * @param workflow - Workflow object with nodes array
   * @returns Workflow with normalized node types
   *
   * @example
   * const workflow = {
   *   nodes: [
   *     { type: 'nodes-base.webhook', id: '1', name: 'Webhook' },
   *     { type: 'nodes-base.set', id: '2', name: 'Set' }
   *   ],
   *   connections: {}
   * };
   * const normalized = normalizeWorkflowNodeTypes(workflow);
   * // workflow.nodes[0].type → 'n8n-nodes-base.webhook'
   * // workflow.nodes[1].type → 'n8n-nodes-base.set'
   */
  static normalizeWorkflowNodeTypes(workflow: any): any {
    if (!workflow?.nodes || !Array.isArray(workflow.nodes)) {
      return workflow;
    }

    return {
      ...workflow,
      nodes: workflow.nodes.map((node: any) => ({
        ...node,
        type: this.normalizeToFullForm(node.type)
      }))
    };
  }

  /**
   * Check if a node type is in full form (needs normalization)
   *
   * @param type - Node type to check
   * @returns True if in full form (will be normalized to short)
   */
  static isFullForm(type: string): boolean {
    if (!type || typeof type !== 'string') {
      return false;
    }

    return (
      type.startsWith('n8n-nodes-base.') ||
      type.startsWith('@n8n/n8n-nodes-langchain.') ||
      type.startsWith('n8n-nodes-langchain.')
    );
  }

  /**
   * Check if a node type is in short form (database format)
   *
   * @param type - Node type to check
   * @returns True if in short form (already in database format)
   */
  static isShortForm(type: string): boolean {
    if (!type || typeof type !== 'string') {
      return false;
    }

    return (
      type.startsWith('nodes-base.') ||
      type.startsWith('nodes-langchain.')
    );
  }

  /**
   * Convert short database format to full n8n workflow format.
   *
   * This method converts node types from the SHORT form used in the database
   * to the FULL form required by the n8n API.
   *
   * @param type - Node type in short database format (e.g., 'nodes-base.webhook')
   * @returns Node type in full workflow format (e.g., 'n8n-nodes-base.webhook')
   *
   * @example
   * toWorkflowFormat('nodes-base.webhook')
   * // → 'n8n-nodes-base.webhook'
   *
   * @example
   * toWorkflowFormat('nodes-langchain.agent')
   * // → '@n8n/n8n-nodes-langchain.agent'
   *
   * @example
   * toWorkflowFormat('n8n-nodes-base.webhook')
   * // → 'n8n-nodes-base.webhook' (already in full format)
   */
  static toWorkflowFormat(type: string): string {
    if (!type || typeof type !== 'string') {
      return type;
    }

    // Convert short form to full form (API/workflow format)
    if (type.startsWith('nodes-base.')) {
      return type.replace(/^nodes-base\./, 'n8n-nodes-base.');
    }
    if (type.startsWith('nodes-langchain.')) {
      return type.replace(/^nodes-langchain\./, '@n8n/n8n-nodes-langchain.');
    }

    // Already in full form or community node - return unchanged
    return type;
  }
}
