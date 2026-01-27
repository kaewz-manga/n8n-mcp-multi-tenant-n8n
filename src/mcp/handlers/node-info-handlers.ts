/**
 * Node information handlers for MCP tools
 * Handles retrieval and formatting of node details, properties, and versions
 */

import { DatabaseAdapter } from '../../database/database-adapter';
import { NodeRepository } from '../../database/node-repository';
import { SimpleCache } from '../../utils/simple-cache';
import { NodeMinimalInfo, NodeStandardInfo, NodeFullInfo, VersionHistoryInfo, VersionComparisonInfo, NodeInfoResponse, VersionSummary, ToolVariantGuidance } from '../types';
import { logger } from '../../utils/logger';
import { getWorkflowNodeType, getNodeTypeAlternatives } from '../../utils/node-utils';
import { NodeTypeNormalizer } from '../../utils/node-type-normalizer';
import { PropertyFilter } from '../../services/property-filter';
import { PropertyDependencies } from '../../services/property-dependencies';
import { TypeStructureService } from '../../services/type-structure-service';

/**
 * Get basic node information with AI tool capabilities
 */
export async function getNodeInfo(
  nodeType: string,
  repository: NodeRepository
): Promise<any> {
  // First try with normalized type (repository will also normalize internally)
  const normalizedType = NodeTypeNormalizer.normalizeToFullForm(nodeType);
  let node = repository.getNode(normalizedType);

  if (!node && normalizedType !== nodeType) {
    // Try original if normalization changed it
    node = repository.getNode(nodeType);
  }

  if (!node) {
    // Fallback to other alternatives for edge cases
    const alternatives = getNodeTypeAlternatives(normalizedType);

    for (const alt of alternatives) {
      const found = repository.getNode(alt);
      if (found) {
        node = found;
        break;
      }
    }
  }

  if (!node) {
    throw new Error(`Node ${nodeType} not found`);
  }

  // Add AI tool capabilities information with null safety
  const aiToolCapabilities = {
    canBeUsedAsTool: true, // Any node can be used as a tool in n8n
    hasUsableAsToolProperty: node.isAITool ?? false,
    requiresEnvironmentVariable: !(node.isAITool ?? false) && node.package !== 'n8n-nodes-base',
    toolConnectionType: 'ai_tool',
    commonToolUseCases: getCommonAIToolUseCases(node.nodeType),
    environmentRequirement: node.package && node.package !== 'n8n-nodes-base' ?
      'N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true' :
      null
  };

  // Process outputs to provide clear mapping with null safety
  let outputs = undefined;
  if (node.outputNames && Array.isArray(node.outputNames) && node.outputNames.length > 0) {
    outputs = node.outputNames.map((name: string, index: number) => {
      // Special handling for loop nodes like SplitInBatches
      const descriptions = getOutputDescriptions(node.nodeType, name, index);
      return {
        index,
        name,
        description: descriptions?.description ?? '',
        connectionGuidance: descriptions?.connectionGuidance ?? ''
      };
    });
  }

  const result: any = {
    ...node,
    workflowNodeType: getWorkflowNodeType(node.package ?? 'n8n-nodes-base', node.nodeType),
    aiToolCapabilities,
    outputs
  };

  // Add tool variant guidance if applicable
  const toolVariantInfo = buildToolVariantGuidance(node);
  if (toolVariantInfo) {
    result.toolVariantInfo = toolVariantInfo;
  }

  return result;
}

/**
 * Get essential properties for a node (AI-friendly subset)
 */
export async function getNodeEssentials(
  nodeType: string,
  includeExamples: boolean,
  repository: NodeRepository,
  db: DatabaseAdapter,
  cache: SimpleCache
): Promise<any> {
  // Check cache first (cache key includes includeExamples)
  const cacheKey = `essentials:${nodeType}:${includeExamples ? 'withExamples' : 'basic'}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Get the full node information
  // First try with normalized type
  const normalizedType = NodeTypeNormalizer.normalizeToFullForm(nodeType);
  let node = repository.getNode(normalizedType);

  if (!node && normalizedType !== nodeType) {
    // Try original if normalization changed it
    node = repository.getNode(nodeType);
  }

  if (!node) {
    // Fallback to other alternatives for edge cases
    const alternatives = getNodeTypeAlternatives(normalizedType);

    for (const alt of alternatives) {
      const found = repository.getNode(alt);
      if (found) {
        node = found;
        break;
      }
    }
  }

  if (!node) {
    throw new Error(`Node ${nodeType} not found`);
  }

  // Get properties (already parsed by repository)
  const allProperties = node.properties || [];

  // Get essential properties
  const essentials = PropertyFilter.getEssentials(allProperties, node.nodeType);

  // Get operations (already parsed by repository)
  const operations = node.operations || [];

  // Get the latest version - this is important for AI to use correct typeVersion
  const latestVersion = node.version ?? '1';

  const result: any = {
    nodeType: node.nodeType,
    workflowNodeType: getWorkflowNodeType(node.package ?? 'n8n-nodes-base', node.nodeType),
    displayName: node.displayName,
    description: node.description,
    category: node.category,
    version: latestVersion,
    isVersioned: node.isVersioned ?? false,
    // Prominent warning to use the correct typeVersion
    versionNotice: `⚠️ Use typeVersion: ${latestVersion} when creating this node`,
    requiredProperties: essentials.required,
    commonProperties: essentials.common,
    operations: operations.map((op: any) => ({
      name: op.name || op.operation,
      description: op.description,
      action: op.action,
      resource: op.resource
    })),
    // Examples removed - use validate_node_operation for working configurations
    metadata: {
      totalProperties: allProperties.length,
      isAITool: node.isAITool ?? false,
      isTrigger: node.isTrigger ?? false,
      isWebhook: node.isWebhook ?? false,
      hasCredentials: node.credentials ? true : false,
      package: node.package ?? 'n8n-nodes-base',
      developmentStyle: node.developmentStyle ?? 'programmatic'
    }
  };

  // Add tool variant guidance if applicable
  const toolVariantInfo = buildToolVariantGuidance(node);
  if (toolVariantInfo) {
    result.toolVariantInfo = toolVariantInfo;
  }

  // Add examples from templates if requested
  if (includeExamples) {
    try {
      // Use the already-computed workflowNodeType from result
      // This ensures consistency with search_nodes behavior
      const examples = db.prepare(`
        SELECT
          parameters_json,
          template_name,
          template_views,
          complexity,
          use_cases,
          has_credentials,
          has_expressions
        FROM template_node_configs
        WHERE node_type = ?
        ORDER BY rank
        LIMIT 3
      `).all(result.workflowNodeType) as any[];

      if (examples.length > 0) {
        (result as any).examples = examples.map((ex: any) => ({
          configuration: JSON.parse(ex.parameters_json),
          source: {
            template: ex.template_name,
            views: ex.template_views,
            complexity: ex.complexity
          },
          useCases: ex.use_cases ? JSON.parse(ex.use_cases).slice(0, 2) : [],
          metadata: {
            hasCredentials: ex.has_credentials === 1,
            hasExpressions: ex.has_expressions === 1
          }
        }));

        (result as any).examplesCount = examples.length;
      } else {
        (result as any).examples = [];
        (result as any).examplesCount = 0;
      }
    } catch (error: any) {
      logger.warn(`Failed to fetch examples for ${nodeType}:`, error.message);
      (result as any).examples = [];
      (result as any).examplesCount = 0;
    }
  }

  // Cache for 1 hour
  cache.set(cacheKey, result, 3600);

  return result;
}

/**
 * Unified node information retrieval with multiple detail levels and modes
 */
export async function getNode(
  nodeType: string,
  detail: string = 'standard',
  mode: string = 'info',
  includeTypeInfo: boolean,
  includeExamples: boolean,
  fromVersion: string | undefined,
  toVersion: string | undefined,
  repository: NodeRepository,
  db: DatabaseAdapter,
  cache: SimpleCache
): Promise<NodeInfoResponse> {
  // Validate parameters
  const validDetailLevels = ['minimal', 'standard', 'full'];
  const validModes = ['info', 'versions', 'compare', 'breaking', 'migrations'];

  if (!validDetailLevels.includes(detail)) {
    throw new Error(`get_node: Invalid detail level "${detail}". Valid options: ${validDetailLevels.join(', ')}`);
  }

  if (!validModes.includes(mode)) {
    throw new Error(`get_node: Invalid mode "${mode}". Valid options: ${validModes.join(', ')}`);
  }

  const normalizedType = NodeTypeNormalizer.normalizeToFullForm(nodeType);

  // Version modes - detail level ignored
  if (mode !== 'info') {
    return handleVersionMode(
      normalizedType,
      mode,
      fromVersion,
      toVersion,
      repository,
      cache
    );
  }

  // Info mode - respect detail level
  return handleInfoMode(
    normalizedType,
    detail,
    includeTypeInfo,
    includeExamples,
    repository,
    db,
    cache
  );
}

/**
 * Handle info mode - returns node information at specified detail level
 */
export async function handleInfoMode(
  nodeType: string,
  detail: string,
  includeTypeInfo: boolean | undefined,
  includeExamples: boolean | undefined,
  repository: NodeRepository,
  db: DatabaseAdapter,
  cache: SimpleCache
): Promise<NodeMinimalInfo | NodeStandardInfo | NodeFullInfo> {
  switch (detail) {
    case 'minimal': {
      // Get basic node metadata only (no version info for minimal mode)
      let node = repository.getNode(nodeType);

      if (!node) {
        const alternatives = getNodeTypeAlternatives(nodeType);
        for (const alt of alternatives) {
          const found = repository.getNode(alt);
          if (found) {
            node = found;
            break;
          }
        }
      }

      if (!node) {
        throw new Error(`Node ${nodeType} not found`);
      }

      const result: NodeMinimalInfo = {
        nodeType: node.nodeType,
        workflowNodeType: getWorkflowNodeType(node.package ?? 'n8n-nodes-base', node.nodeType),
        displayName: node.displayName,
        description: node.description,
        category: node.category,
        package: node.package,
        isAITool: node.isAITool,
        isTrigger: node.isTrigger,
        isWebhook: node.isWebhook
      };

      // Add tool variant guidance if applicable
      const toolVariantInfo = buildToolVariantGuidance(node);
      if (toolVariantInfo) {
        result.toolVariantInfo = toolVariantInfo;
      }

      return result;
    }

    case 'standard': {
      // Use existing getNodeEssentials logic
      const essentials = await getNodeEssentials(nodeType, !!includeExamples, repository, db, cache);
      const versionSummary = getVersionSummary(nodeType, repository, cache);

      // Apply type info enrichment if requested
      if (includeTypeInfo) {
        essentials.requiredProperties = enrichPropertiesWithTypeInfo(essentials.requiredProperties);
        essentials.commonProperties = enrichPropertiesWithTypeInfo(essentials.commonProperties);
      }

      return {
        ...essentials,
        versionInfo: versionSummary
      };
    }

    case 'full': {
      // Use existing getNodeInfo logic
      const fullInfo = await getNodeInfo(nodeType, repository);
      const versionSummary = getVersionSummary(nodeType, repository, cache);

      // Apply type info enrichment if requested
      if (includeTypeInfo && fullInfo.properties) {
        fullInfo.properties = enrichPropertiesWithTypeInfo(fullInfo.properties);
      }

      return {
        ...fullInfo,
        versionInfo: versionSummary
      };
    }

    default:
      throw new Error(`Unknown detail level: ${detail}`);
  }
}

/**
 * Handle version modes - returns version history and comparison data
 */
export async function handleVersionMode(
  nodeType: string,
  mode: string,
  fromVersion: string | undefined,
  toVersion: string | undefined,
  repository: NodeRepository,
  cache: SimpleCache
): Promise<VersionHistoryInfo | VersionComparisonInfo> {
  switch (mode) {
    case 'versions':
      return getVersionHistory(nodeType, repository);

    case 'compare':
      if (!fromVersion) {
        throw new Error(`get_node: fromVersion is required for compare mode (nodeType: ${nodeType})`);
      }
      return compareVersions(nodeType, fromVersion, toVersion, repository);

    case 'breaking':
      if (!fromVersion) {
        throw new Error(`get_node: fromVersion is required for breaking mode (nodeType: ${nodeType})`);
      }
      return getBreakingChanges(nodeType, fromVersion, toVersion, repository);

    case 'migrations':
      if (!fromVersion || !toVersion) {
        throw new Error(`get_node: Both fromVersion and toVersion are required for migrations mode (nodeType: ${nodeType})`);
      }
      return getMigrations(nodeType, fromVersion, toVersion, repository);

    default:
      throw new Error(`get_node: Unknown mode: ${mode} (nodeType: ${nodeType})`);
  }
}

/**
 * Get version summary (always included in info mode responses)
 * Cached for 24 hours to improve performance
 */
export function getVersionSummary(nodeType: string, repository: NodeRepository, cache: SimpleCache): VersionSummary {
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
 * Enrich property with type structure metadata
 */
export function enrichPropertyWithTypeInfo(property: any): any {
  if (!property || !property.type) return property;

  const structure = TypeStructureService.getStructure(property.type);
  if (!structure) return property;

  return {
    ...property,
    typeInfo: {
      category: structure.type,
      jsType: structure.jsType,
      description: structure.description,
      isComplex: TypeStructureService.isComplexType(property.type),
      isPrimitive: TypeStructureService.isPrimitiveType(property.type),
      allowsExpressions: structure.validation?.allowExpressions ?? true,
      allowsEmpty: structure.validation?.allowEmpty ?? false,
      ...(structure.structure && {
        structureHints: {
          hasProperties: !!structure.structure.properties,
          hasItems: !!structure.structure.items,
          isFlexible: structure.structure.flexible ?? false,
          requiredFields: structure.structure.required ?? []
        }
      }),
      ...(structure.notes && { notes: structure.notes })
    }
  };
}

/**
 * Enrich an array of properties with type structure metadata
 */
export function enrichPropertiesWithTypeInfo(properties: any[]): any[] {
  if (!properties || !Array.isArray(properties)) return properties;
  return properties.map((prop: any) => enrichPropertyWithTypeInfo(prop));
}

/**
 * Search node properties by keyword
 */
export async function searchNodeProperties(
  nodeType: string,
  query: string,
  maxResults: number,
  repository: NodeRepository
): Promise<any> {
  // Get the node
  // First try with normalized type
  const normalizedType = NodeTypeNormalizer.normalizeToFullForm(nodeType);
  let node = repository.getNode(normalizedType);

  if (!node && normalizedType !== nodeType) {
    // Try original if normalization changed it
    node = repository.getNode(nodeType);
  }

  if (!node) {
    // Fallback to other alternatives for edge cases
    const alternatives = getNodeTypeAlternatives(normalizedType);

    for (const alt of alternatives) {
      const found = repository.getNode(alt);
      if (found) {
        node = found;
        break;
      }
    }
  }

  if (!node) {
    throw new Error(`Node ${nodeType} not found`);
  }

  // Get properties and search (already parsed by repository)
  const allProperties = node.properties || [];
  const matches = PropertyFilter.searchProperties(allProperties, query, maxResults);

  return {
    nodeType: node.nodeType,
    query,
    matches: matches.map((match: any) => ({
      name: match.name,
      displayName: match.displayName,
      type: match.type,
      description: match.description,
      path: match.path || match.name,
      required: match.required,
      default: match.default,
      options: match.options,
      showWhen: match.showWhen
    })),
    totalMatches: matches.length,
    searchedIn: allProperties.length + ' properties'
  };
}

/**
 * Get property dependencies for a node
 */
export async function getPropertyDependencies(
  nodeType: string,
  config: Record<string, any> | undefined,
  repository: NodeRepository
): Promise<any> {
  // Get node info to access properties
  // First try with normalized type
  const normalizedType = NodeTypeNormalizer.normalizeToFullForm(nodeType);
  let node = repository.getNode(normalizedType);

  if (!node && normalizedType !== nodeType) {
    // Try original if normalization changed it
    node = repository.getNode(nodeType);
  }

  if (!node) {
    // Fallback to other alternatives for edge cases
    const alternatives = getNodeTypeAlternatives(normalizedType);

    for (const alt of alternatives) {
      const found = repository.getNode(alt);
      if (found) {
        node = found;
        break;
      }
    }
  }

  if (!node) {
    throw new Error(`Node ${nodeType} not found`);
  }

  // Get properties
  const properties = node.properties || [];

  // Analyze dependencies
  const analysis = PropertyDependencies.analyze(properties);

  // If config provided, check visibility impact
  let visibilityImpact = null;
  if (config) {
    visibilityImpact = PropertyDependencies.getVisibilityImpact(properties, config);
  }

  return {
    nodeType: node.nodeType,
    displayName: node.displayName,
    ...analysis,
    currentConfig: config ? {
      providedValues: config,
      visibilityImpact
    } : undefined
  };
}

/**
 * Get node information optimized for AI tool usage
 */
export async function getNodeAsToolInfo(nodeType: string, repository: NodeRepository): Promise<any> {
  // Get node info
  // First try with normalized type
  const normalizedType = NodeTypeNormalizer.normalizeToFullForm(nodeType);
  let node = repository.getNode(normalizedType);

  if (!node && normalizedType !== nodeType) {
    // Try original if normalization changed it
    node = repository.getNode(nodeType);
  }

  if (!node) {
    // Fallback to other alternatives for edge cases
    const alternatives = getNodeTypeAlternatives(normalizedType);

    for (const alt of alternatives) {
      const found = repository.getNode(alt);
      if (found) {
        node = found;
        break;
      }
    }
  }

  if (!node) {
    throw new Error(`Node ${nodeType} not found`);
  }

  // Determine common AI tool use cases based on node type
  const commonUseCases = getCommonAIToolUseCases(node.nodeType);

  // Build AI tool capabilities info
  const aiToolCapabilities = {
    canBeUsedAsTool: true, // In n8n, ANY node can be used as a tool when connected to AI Agent
    hasUsableAsToolProperty: node.isAITool,
    requiresEnvironmentVariable: !node.isAITool && node.package !== 'n8n-nodes-base',
    connectionType: 'ai_tool',
    commonUseCases,
    requirements: {
      connection: 'Connect to the "ai_tool" port of an AI Agent node',
      environment: node.package !== 'n8n-nodes-base' ?
        'Set N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true for community nodes' :
        'No special environment variables needed for built-in nodes'
    },
    examples: getAIToolExamples(node.nodeType),
    tips: [
      'Give the tool a clear, descriptive name in the AI Agent settings',
      'Write a detailed tool description to help the AI understand when to use it',
      'Test the node independently before connecting it as a tool',
      node.isAITool ?
        'This node is optimized for AI tool usage' :
        'This is a regular node that can be used as an AI tool'
    ]
  };

  return {
    nodeType: node.nodeType,
    workflowNodeType: getWorkflowNodeType(node.package, node.nodeType),
    displayName: node.displayName,
    description: node.description,
    package: node.package,
    isMarkedAsAITool: node.isAITool,
    aiToolCapabilities
  };
}

// Helper functions

function getOutputDescriptions(nodeType: string, outputName: string, index: number): { description: string, connectionGuidance: string } {
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

function getCommonAIToolUseCases(nodeType: string): string[] {
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

function buildToolVariantGuidance(node: any): ToolVariantGuidance | undefined {
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

function getAIToolExamples(nodeType: string): any {
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
