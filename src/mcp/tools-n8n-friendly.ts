/**
 * n8n-friendly tool descriptions
 * These descriptions are optimized to reduce schema validation errors in n8n's AI Agent
 * 
 * Key principles:
 * 1. Use exact JSON examples in descriptions
 * 2. Be explicit about data types
 * 3. Keep descriptions short and directive
 * 4. Avoid ambiguity
 */

export const n8nFriendlyDescriptions: Record<string, {
  description: string;
  params: Record<string, string>;
}> = {
  // Consolidated validation tool (replaces validate_node_operation and validate_node_minimal)
  validate_node: {
    description: 'Validate n8n node config. Pass nodeType (string) and config (object). Use mode="full" for comprehensive validation, mode="minimal" for quick check. Example: {"nodeType": "nodes-base.slack", "config": {"resource": "channel", "operation": "create"}}',
    params: {
      nodeType: 'String value like "nodes-base.slack"',
      config: 'Object value like {"resource": "channel", "operation": "create"} or empty object {}',
      mode: 'Optional string: "full" (default) or "minimal"',
      profile: 'Optional string: "minimal" or "runtime" or "ai-friendly" or "strict"'
    }
  },

  // Search tool
  search_nodes: {
    description: 'Search nodes. Pass query (string). Example: {"query": "webhook"}',
    params: {
      query: 'String keyword like "webhook" or "database"',
      limit: 'Optional number, default 20'
    }
  },

  // Consolidated node info tool (replaces get_node_info, get_node_essentials, get_node_documentation, search_node_properties)
  get_node: {
    description: 'Get node info with multiple modes. Pass nodeType (string). Use mode="info" for config, mode="docs" for documentation, mode="search_properties" with propertyQuery for finding fields. Example: {"nodeType": "nodes-base.httpRequest", "detail": "standard"}',
    params: {
      nodeType: 'String with prefix like "nodes-base.httpRequest"',
      mode: 'Optional string: "info" (default), "docs", "search_properties", "versions", "compare", "breaking", "migrations"',
      detail: 'Optional string: "minimal", "standard" (default), "full"',
      propertyQuery: 'For mode="search_properties": search term like "auth"'
    }
  },

  // Workflow validation
  validate_workflow: {
    description: 'Validate workflow structure, connections, and expressions. Pass workflow object. MUST have: {"workflow": {"nodes": [array of node objects], "connections": {object with node connections}}}. Each node needs: name, type, typeVersion, position.',
    params: {
      workflow: 'Object with two required fields: nodes (array) and connections (object). Example: {"nodes": [{"name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [250, 300], "parameters": {}}], "connections": {}}',
      options: 'Optional object. Example: {"validateNodes": true, "validateConnections": true, "validateExpressions": true, "profile": "runtime"}'
    }
  },

  // Consolidated template search (replaces search_templates, list_node_templates, search_templates_by_metadata, get_templates_for_task)
  search_templates: {
    description: 'Search workflow templates with multiple modes. Use searchMode="keyword" for text search, searchMode="by_nodes" to find by node types, searchMode="by_task" for task-based templates, searchMode="by_metadata" for filtering. Example: {"query": "chatbot"} or {"searchMode": "by_task", "task": "webhook_processing"}',
    params: {
      query: 'For searchMode="keyword": string keyword like "chatbot"',
      searchMode: 'Optional: "keyword" (default), "by_nodes", "by_task", "by_metadata"',
      nodeTypes: 'For searchMode="by_nodes": array like ["n8n-nodes-base.httpRequest"]',
      task: 'For searchMode="by_task": task like "webhook_processing", "ai_automation"',
      limit: 'Optional number, default 20'
    }
  },

  get_template: {
    description: 'Get template by ID. Pass templateId (number). Example: {"templateId": 1234}',
    params: {
      templateId: 'Number ID like 1234',
      mode: 'Optional: "full" (default), "nodes_only", "structure"'
    }
  },

  // Documentation tool
  tools_documentation: {
    description: 'Get tool docs. Pass optional depth (string). Example: {"depth": "essentials"} or {}',
    params: {
      depth: 'Optional string: "essentials" (default) or "full"',
      topic: 'Optional string tool name like "search_nodes"'
    }
  }
};

/**
 * Apply n8n-friendly descriptions to tools
 * This function modifies tool descriptions to be more explicit for n8n's AI agent
 */
export function makeToolsN8nFriendly(tools: any[]): any[] {
  return tools.map(tool => {
    const toolName = tool.name as string;
    const friendlyDesc = n8nFriendlyDescriptions[toolName];
    if (friendlyDesc) {
      // Clone the tool to avoid mutating the original
      const updatedTool = { ...tool };
      
      // Update the main description
      updatedTool.description = friendlyDesc.description;
      
      // Clone inputSchema if it exists
      if (tool.inputSchema?.properties) {
        updatedTool.inputSchema = {
          ...tool.inputSchema,
          properties: { ...tool.inputSchema.properties }
        };
        
        // Update parameter descriptions
        Object.keys(updatedTool.inputSchema.properties).forEach(param => {
          if (friendlyDesc.params[param]) {
            updatedTool.inputSchema.properties[param] = {
              ...updatedTool.inputSchema.properties[param],
              description: friendlyDesc.params[param]
            };
          }
        });
      }
      
      return updatedTool;
    }
    return tool;
  });
}