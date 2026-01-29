/**
 * Node utility functions for metadata and version information
 */

import { ToolVariantGuidance, VersionSummary } from '../types';
import { NodeRepository } from '../../database/node-repository';
import { SimpleCache } from '../../utils/simple-cache';

/**
 * Get version summary for a node
 */
export function getVersionSummary(
  nodeType: string,
  repository: NodeRepository,
  cache: SimpleCache
): VersionSummary {
  const cacheKey = `version-summary:${nodeType}`;
  const cached = cache.get(cacheKey) as VersionSummary | null;

  if (cached) {
    return cached;
  }

  const versions = repository.getNodeVersions(nodeType);
  const latest = repository.getLatestNodeVersion(nodeType);

  const summary: VersionSummary = {
    currentVersion: latest?.version || 'unknown',
    totalVersions: versions.length,
    hasVersionHistory: versions.length > 0
  };

  // Cache for 24 hours (86400000 ms)
  cache.set(cacheKey, summary, 86400000);

  return summary;
}

/**
 * Get complete version history for a node
 */
export function getVersionHistory(nodeType: string, repository: NodeRepository): any {
  const versions = repository.getNodeVersions(nodeType);

  return {
    nodeType,
    totalVersions: versions.length,
    versions: versions.map(v => ({
      version: v.version,
      isCurrent: v.isCurrentMax,
      minimumN8nVersion: v.minimumN8nVersion,
      releasedAt: v.releasedAt,
      hasBreakingChanges: (v.breakingChanges || []).length > 0,
      breakingChangesCount: (v.breakingChanges || []).length,
      deprecatedProperties: v.deprecatedProperties || [],
      addedProperties: v.addedProperties || []
    })),
    available: versions.length > 0,
    message: versions.length === 0 ?
      'No version history available. Version tracking may not be enabled for this node.' :
      undefined
  };
}

/**
 * Compare two versions of a node
 */
export function compareVersions(
  nodeType: string,
  fromVersion: string,
  toVersion: string | undefined,
  repository: NodeRepository
): any {
  const latest = repository.getLatestNodeVersion(nodeType);
  const targetVersion = toVersion || latest?.version;

  if (!targetVersion) {
    throw new Error('No target version available');
  }

  const changes = repository.getPropertyChanges(
    nodeType,
    fromVersion,
    targetVersion
  );

  return {
    nodeType,
    fromVersion,
    toVersion: targetVersion,
    totalChanges: changes.length,
    breakingChanges: changes.filter(c => c.isBreaking).length,
    changes: changes.map(c => ({
      property: c.propertyName,
      changeType: c.changeType,
      isBreaking: c.isBreaking,
      severity: c.severity,
      oldValue: c.oldValue,
      newValue: c.newValue,
      migrationHint: c.migrationHint,
      autoMigratable: c.autoMigratable
    }))
  };
}

/**
 * Get breaking changes between versions
 */
export function getBreakingChanges(
  nodeType: string,
  fromVersion: string,
  toVersion: string | undefined,
  repository: NodeRepository
): any {
  const breakingChanges = repository.getBreakingChanges(
    nodeType,
    fromVersion,
    toVersion
  );

  return {
    nodeType,
    fromVersion,
    toVersion: toVersion || 'latest',
    totalBreakingChanges: breakingChanges.length,
    changes: breakingChanges.map(c => ({
      fromVersion: c.fromVersion,
      toVersion: c.toVersion,
      property: c.propertyName,
      changeType: c.changeType,
      severity: c.severity,
      migrationHint: c.migrationHint,
      oldValue: c.oldValue,
      newValue: c.newValue
    })),
    upgradeSafe: breakingChanges.length === 0
  };
}

/**
 * Get auto-migratable changes between versions
 */
export function getMigrations(
  nodeType: string,
  fromVersion: string,
  toVersion: string,
  repository: NodeRepository
): any {
  const migrations = repository.getAutoMigratableChanges(
    nodeType,
    fromVersion,
    toVersion
  );

  const allChanges = repository.getPropertyChanges(
    nodeType,
    fromVersion,
    toVersion
  );

  return {
    nodeType,
    fromVersion,
    toVersion,
    autoMigratableChanges: migrations.length,
    totalChanges: allChanges.length,
    migrations: migrations.map(m => ({
      property: m.propertyName,
      changeType: m.changeType,
      migrationStrategy: m.migrationStrategy,
      severity: m.severity
    })),
    requiresManualMigration: migrations.length < allChanges.length
  };
}

/**
 * Build tool variant guidance for node responses.
 * Provides cross-reference information between base nodes and their Tool variants.
 */
export function buildToolVariantGuidance(node: any): ToolVariantGuidance | undefined {
  const isToolVariant = !!node.isToolVariant;
  const hasToolVariant = !!node.hasToolVariant;
  const toolVariantOf = node.toolVariantOf;

  // If this is neither a Tool variant nor has one, no guidance needed
  if (!isToolVariant && !hasToolVariant) {
    return undefined;
  }

  if (isToolVariant) {
    // This IS a Tool variant (e.g., nodes-base.supabaseTool)
    return {
      isToolVariant: true,
      toolVariantOf,
      hasToolVariant: false,
      guidance: `This is the Tool variant for AI Agent integration. Use this node type when connecting to AI Agents. The base node is: ${toolVariantOf}`
    };
  }

  if (hasToolVariant && node.nodeType) {
    // This base node HAS a Tool variant (e.g., nodes-base.supabase)
    const toolVariantNodeType = `${node.nodeType}Tool`;
    return {
      isToolVariant: false,
      hasToolVariant: true,
      toolVariantNodeType,
      guidance: `To use this node with AI Agents, use the Tool variant: ${toolVariantNodeType}. The Tool variant has an additional 'toolDescription' property and outputs 'ai_tool' instead of 'main'.`
    };
  }

  return undefined;
}

/**
 * Get output descriptions for special nodes (loops, conditionals)
 */
export function getOutputDescriptions(
  nodeType: string,
  outputName: string,
  index: number
): { description: string, connectionGuidance: string } {
  // Special handling for loop nodes
  if (nodeType === 'nodes-base.splitInBatches') {
    if (outputName === 'done' && index === 0) {
      return {
        description: 'Final processed data after all iterations complete',
        connectionGuidance: 'Connect to nodes that should run AFTER the loop completes'
      };
    } else if (outputName === 'loop' && index === 1) {
      return {
        description: 'Current batch data for this iteration',
        connectionGuidance: 'Connect to nodes that process items INSIDE the loop (and connect their output back to this node)'
      };
    }
  }

  // Special handling for IF node
  if (nodeType === 'nodes-base.if') {
    if (outputName === 'true' && index === 0) {
      return {
        description: 'Items that match the condition',
        connectionGuidance: 'Connect to nodes that handle the TRUE case'
      };
    } else if (outputName === 'false' && index === 1) {
      return {
        description: 'Items that do not match the condition',
        connectionGuidance: 'Connect to nodes that handle the FALSE case'
      };
    }
  }

  // Special handling for Switch node
  if (nodeType === 'nodes-base.switch') {
    return {
      description: `Output ${index}: ${outputName || 'Route ' + index}`,
      connectionGuidance: `Connect to nodes for the "${outputName || 'route ' + index}" case`
    };
  }

  // Default handling
  return {
    description: outputName || `Output ${index}`,
    connectionGuidance: `Connect to downstream nodes`
  };
}

/**
 * Get common AI tool use cases for a node type
 */
export function getCommonAIToolUseCases(nodeType: string): string[] {
  const useCaseMap: Record<string, string[]> = {
    'nodes-base.slack': [
      'Send notifications about task completion',
      'Post updates to channels',
      'Send direct messages',
      'Create alerts and reminders'
    ],
    'nodes-base.googleSheets': [
      'Read data for analysis',
      'Log results and outputs',
      'Update spreadsheet records',
      'Create reports'
    ],
    'nodes-base.gmail': [
      'Send email notifications',
      'Read and process emails',
      'Send reports and summaries',
      'Handle email-based workflows'
    ],
    'nodes-base.httpRequest': [
      'Call external APIs',
      'Fetch data from web services',
      'Send webhooks',
      'Integrate with any REST API'
    ],
    'nodes-base.postgres': [
      'Query database for information',
      'Store analysis results',
      'Update records based on AI decisions',
      'Generate reports from data'
    ],
    'nodes-base.webhook': [
      'Receive external triggers',
      'Create callback endpoints',
      'Handle incoming data',
      'Integrate with external systems'
    ]
  };

  // Check for partial matches
  for (const [key, useCases] of Object.entries(useCaseMap)) {
    if (nodeType.includes(key)) {
      return useCases;
    }
  }

  // Generic use cases for unknown nodes
  return [
    'Perform automated actions',
    'Integrate with external services',
    'Process and transform data',
    'Extend AI agent capabilities'
  ];
}

/**
 * Get AI tool configuration examples for common node types
 */
export function getAIToolExamples(nodeType: string): any {
  const exampleMap: Record<string, any> = {
    'nodes-base.slack': {
      toolName: 'Send Slack Message',
      toolDescription: 'Sends a message to a specified Slack channel or user. Use this to notify team members about important events or results.',
      nodeConfig: {
        resource: 'message',
        operation: 'post',
        channel: '={{ $fromAI("channel", "The Slack channel to send to, e.g. #general") }}',
        text: '={{ $fromAI("message", "The message content to send") }}'
      }
    },
    'nodes-base.googleSheets': {
      toolName: 'Update Google Sheet',
      toolDescription: 'Reads or updates data in a Google Sheets spreadsheet. Use this to log information, retrieve data, or update records.',
      nodeConfig: {
        operation: 'append',
        sheetId: 'your-sheet-id',
        range: 'A:Z',
        dataMode: 'autoMap'
      }
    },
    'nodes-base.httpRequest': {
      toolName: 'Call API',
      toolDescription: 'Makes HTTP requests to external APIs. Use this to fetch data, trigger webhooks, or integrate with any web service.',
      nodeConfig: {
        method: '={{ $fromAI("method", "HTTP method: GET, POST, PUT, DELETE") }}',
        url: '={{ $fromAI("url", "The complete API endpoint URL") }}',
        sendBody: true,
        bodyContentType: 'json',
        jsonBody: '={{ $fromAI("body", "Request body as JSON object") }}'
      }
    }
  };

  // Check for exact match or partial match
  for (const [key, example] of Object.entries(exampleMap)) {
    if (nodeType.includes(key)) {
      return example;
    }
  }

  // Generic example
  return {
    toolName: 'Custom Tool',
    toolDescription: 'Performs specific operations. Describe what this tool does and when to use it.',
    nodeConfig: {
      note: 'Configure the node based on its specific requirements'
    }
  };
}

/**
 * Get property value from config using dot notation path
 */
export function getPropertyValue(config: any, path: string): any {
  const parts = path.split('.');
  let value = config;

  for (const part of parts) {
    // Handle array notation like parameters[0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      value = value?.[arrayMatch[1]]?.[parseInt(arrayMatch[2])];
    } else {
      value = value?.[part];
    }
  }

  return value;
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse(json: string, defaultValue: any = null): any {
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
}
