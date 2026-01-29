/**
 * Discovery handlers for MCP tools
 * Handles node search, listing, and discovery operations
 */

import { DatabaseAdapter } from '../../database/database-adapter';
import { NodeRepository } from '../../database/node-repository';
import { SimpleCache } from '../../utils/simple-cache';
import { NodeRow, ServerContext } from '../types';
import { logger } from '../../utils/logger';
import { telemetry } from '../../telemetry';
import { getWorkflowNodeType, getNodeTypeAlternatives } from '../../utils/node-utils';
import { NodeTypeNormalizer } from '../../utils/node-type-normalizer';

/**
 * List nodes with optional filtering
 */
export async function listNodes(
  filters: any = {},
  db: DatabaseAdapter
): Promise<any> {
  let query = 'SELECT * FROM nodes WHERE 1=1';
  const params: any[] = [];

  if (filters.package) {
    // Handle both formats
    const packageVariants = [
      filters.package,
      `@n8n/${filters.package}`,
      filters.package.replace('@n8n/', '')
    ];
    query += ' AND package_name IN (' + packageVariants.map(() => '?').join(',') + ')';
    params.push(...packageVariants);
  }

  if (filters.category) {
    query += ' AND category = ?';
    params.push(filters.category);
  }

  if (filters.developmentStyle) {
    query += ' AND development_style = ?';
    params.push(filters.developmentStyle);
  }

  if (filters.isAITool !== undefined) {
    query += ' AND is_ai_tool = ?';
    params.push(filters.isAITool ? 1 : 0);
  }

  query += ' ORDER BY display_name';

  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const nodes = db.prepare(query).all(...params) as NodeRow[];

  return {
    nodes: nodes.map(node => ({
      nodeType: node.node_type,
      displayName: node.display_name,
      description: node.description,
      category: node.category,
      package: node.package_name,
      developmentStyle: node.development_style,
      isAITool: Number(node.is_ai_tool) === 1,
      isTrigger: Number(node.is_trigger) === 1,
      isVersioned: Number(node.is_versioned) === 1,
    })),
    totalCount: nodes.length,
  };
}

/**
 * Primary search method used by ALL MCP search tools.
 *
 * This method automatically detects and uses FTS5 full-text search when available,
 * falling back to LIKE queries only if FTS5 table doesn't exist.
 */
export async function searchNodes(
  query: string,
  limit: number = 20,
  options: {
    mode?: 'OR' | 'AND' | 'FUZZY';
    includeSource?: boolean;
    includeExamples?: boolean;
    source?: 'all' | 'core' | 'community' | 'verified';
  },
  db: DatabaseAdapter
): Promise<any> {
  // Normalize the query if it looks like a full node type
  let normalizedQuery = query;

  // Check if query contains node type patterns and normalize them
  if (query.includes('n8n-nodes-base.') || query.includes('@n8n/n8n-nodes-langchain.')) {
    normalizedQuery = query
      .replace(/n8n-nodes-base\./g, 'nodes-base.')
      .replace(/@n8n\/n8n-nodes-langchain\./g, 'nodes-langchain.');
  }

  const searchMode = options?.mode || 'OR';

  // Check if FTS5 table exists
  const ftsExists = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='nodes_fts'
  `).get();

  if (ftsExists) {
    // Use FTS5 search with normalized query
    logger.debug(`Using FTS5 search with includeExamples=${options?.includeExamples}`);
    return searchNodesFTS(normalizedQuery, limit, searchMode, options, db);
  } else {
    // Fallback to LIKE search with normalized query
    logger.debug('Using LIKE search (no FTS5)');
    return searchNodesLIKE(normalizedQuery, limit, options, db);
  }
}

/**
 * FTS5-based search implementation
 */
export async function searchNodesFTS(
  query: string,
  limit: number,
  mode: 'OR' | 'AND' | 'FUZZY',
  options: {
    includeSource?: boolean;
    includeExamples?: boolean;
    source?: 'all' | 'core' | 'community' | 'verified';
  },
  db: DatabaseAdapter
): Promise<any> {
  // Clean and prepare the query
  const cleanedQuery = query.trim();
  if (!cleanedQuery) {
    return { query, results: [], totalCount: 0 };
  }

  // For FUZZY mode, use LIKE search with typo patterns
  if (mode === 'FUZZY') {
    return searchNodesFuzzy(cleanedQuery, limit, db);
  }

  let ftsQuery: string;

  // Handle exact phrase searches with quotes
  if (cleanedQuery.startsWith('"') && cleanedQuery.endsWith('"')) {
    // Keep exact phrase as is for FTS5
    ftsQuery = cleanedQuery;
  } else {
    // Split into words and handle based on mode
    const words = cleanedQuery.split(/\s+/).filter(w => w.length > 0);

    switch (mode) {
      case 'AND':
        // All words must be present
        ftsQuery = words.join(' AND ');
        break;

      case 'OR':
      default:
        // Any word can match (default)
        ftsQuery = words.join(' OR ');
        break;
    }
  }

  try {
    // Build source filter SQL
    let sourceFilter = '';
    const sourceValue = options?.source || 'all';
    switch (sourceValue) {
      case 'core':
        sourceFilter = 'AND n.is_community = 0';
        break;
      case 'community':
        sourceFilter = 'AND n.is_community = 1';
        break;
      case 'verified':
        sourceFilter = 'AND n.is_community = 1 AND n.is_verified = 1';
        break;
      // 'all' - no filter
    }

    // Use FTS5 with ranking
    const nodes = db.prepare(`
      SELECT
        n.*,
        rank
      FROM nodes n
      JOIN nodes_fts ON n.rowid = nodes_fts.rowid
      WHERE nodes_fts MATCH ?
      ${sourceFilter}
      ORDER BY
        CASE
          WHEN LOWER(n.display_name) = LOWER(?) THEN 0
          WHEN LOWER(n.display_name) LIKE LOWER(?) THEN 1
          WHEN LOWER(n.node_type) LIKE LOWER(?) THEN 2
          ELSE 3
        END,
        rank,
        n.display_name
      LIMIT ?
    `).all(ftsQuery, cleanedQuery, `%${cleanedQuery}%`, `%${cleanedQuery}%`, limit) as (NodeRow & { rank: number })[];

    // Apply additional relevance scoring for better results
    const scoredNodes = nodes.map(node => {
      const relevanceScore = calculateRelevanceScore(node, cleanedQuery);
      return { ...node, relevanceScore };
    });

    // Sort by combined score (FTS rank + relevance score)
    scoredNodes.sort((a, b) => {
      // Prioritize exact matches
      if (a.display_name.toLowerCase() === cleanedQuery.toLowerCase()) return -1;
      if (b.display_name.toLowerCase() === cleanedQuery.toLowerCase()) return 1;

      // Then by relevance score
      if (a.relevanceScore !== b.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }

      // Then by FTS rank
      return a.rank - b.rank;
    });

    // If FTS didn't find key primary nodes, augment with LIKE search
    const hasHttpRequest = scoredNodes.some(n => n.node_type === 'nodes-base.httpRequest');
    if (cleanedQuery.toLowerCase().includes('http') && !hasHttpRequest) {
      // FTS missed HTTP Request, fall back to LIKE search
      logger.debug('FTS missed HTTP Request node, augmenting with LIKE search');
      return searchNodesLIKE(query, limit, options, db);
    }

    const result: any = {
      query,
      results: scoredNodes.map(node => {
        const nodeResult: any = {
          nodeType: node.node_type,
          workflowNodeType: getWorkflowNodeType(node.package_name, node.node_type),
          displayName: node.display_name,
          description: node.description,
          category: node.category,
          package: node.package_name,
          relevance: calculateRelevance(node, cleanedQuery)
        };

        // Add community metadata if this is a community node
        if ((node as any).is_community === 1) {
          nodeResult.isCommunity = true;
          nodeResult.isVerified = (node as any).is_verified === 1;
          if ((node as any).author_name) {
            nodeResult.authorName = (node as any).author_name;
          }
          if ((node as any).npm_downloads) {
            nodeResult.npmDownloads = (node as any).npm_downloads;
          }
        }

        return nodeResult;
      }),
      totalCount: scoredNodes.length
    };

    // Only include mode if it's not the default
    if (mode !== 'OR') {
      result.mode = mode;
    }

    // Add examples if requested
    if (options && options.includeExamples) {
      try {
        for (const nodeResult of result.results) {
          const examples = db.prepare(`
            SELECT
              parameters_json,
              template_name,
              template_views
            FROM template_node_configs
            WHERE node_type = ?
            ORDER BY rank
            LIMIT 2
          `).all(nodeResult.workflowNodeType) as any[];

          if (examples.length > 0) {
            nodeResult.examples = examples.map((ex: any) => ({
              configuration: JSON.parse(ex.parameters_json),
              template: ex.template_name,
              views: ex.template_views
            }));
          }
        }
      } catch (error: any) {
        logger.error(`Failed to add examples:`, error);
      }
    }

    // Track search query telemetry
    telemetry.trackSearchQuery(query, scoredNodes.length, mode ?? 'OR');

    return result;

  } catch (error: any) {
    // If FTS5 query fails, fallback to LIKE search
    logger.warn('FTS5 search failed, falling back to LIKE search:', error.message);

    // Special handling for syntax errors
    if (error.message.includes('syntax error') || error.message.includes('fts5')) {
      logger.warn(`FTS5 syntax error for query "${query}" in mode ${mode}`);

      // For problematic queries, use LIKE search with mode info
      const likeResult = await searchNodesLIKE(query, limit, options, db);

      // Track search query telemetry for fallback
      telemetry.trackSearchQuery(query, likeResult.results?.length ?? 0, `${mode}_LIKE_FALLBACK`);

      return {
        ...likeResult,
        mode
      };
    }

    return searchNodesLIKE(query, limit, options, db);
  }
}

/**
 * Fuzzy search implementation using edit distance
 */
export async function searchNodesFuzzy(query: string, limit: number, db: DatabaseAdapter): Promise<any> {
  // Split into words for fuzzy matching
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);

  if (words.length === 0) {
    return { query, results: [], totalCount: 0, mode: 'FUZZY' };
  }

  // For fuzzy search, get ALL nodes to ensure we don't miss potential matches
  // We'll limit results after scoring
  const candidateNodes = db.prepare(`
    SELECT * FROM nodes
  `).all() as NodeRow[];

  // Calculate fuzzy scores for candidate nodes
  const scoredNodes = candidateNodes.map(node => {
    const score = calculateFuzzyScore(node, query);
    return { node, score };
  });

  // Filter and sort by score
  const matchingNodes = scoredNodes
    .filter(item => item.score >= 200) // Lower threshold for better typo tolerance
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.node);

  // Debug logging
  if (matchingNodes.length === 0) {
    const topScores = scoredNodes
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    logger.debug(`FUZZY search for "${query}" - no matches above 400. Top scores:`,
      topScores.map(s => ({ name: s.node.display_name, score: s.score })));
  }

  return {
    query,
    mode: 'FUZZY',
    results: matchingNodes.map(node => ({
      nodeType: node.node_type,
      workflowNodeType: getWorkflowNodeType(node.package_name, node.node_type),
      displayName: node.display_name,
      description: node.description,
      category: node.category,
      package: node.package_name
    })),
    totalCount: matchingNodes.length
  };
}

/**
 * LIKE-based fallback search implementation
 */
export async function searchNodesLIKE(
  query: string,
  limit: number,
  options: {
    includeSource?: boolean;
    includeExamples?: boolean;
    source?: 'all' | 'core' | 'community' | 'verified';
  },
  db: DatabaseAdapter
): Promise<any> {
  // Build source filter SQL
  let sourceFilter = '';
  const sourceValue = options?.source || 'all';
  switch (sourceValue) {
    case 'core':
      sourceFilter = 'AND is_community = 0';
      break;
    case 'community':
      sourceFilter = 'AND is_community = 1';
      break;
    case 'verified':
      sourceFilter = 'AND is_community = 1 AND is_verified = 1';
      break;
    // 'all' - no filter
  }

  // Handle exact phrase searches with quotes
  if (query.startsWith('"') && query.endsWith('"')) {
    const exactPhrase = query.slice(1, -1);
    const nodes = db.prepare(`
      SELECT * FROM nodes
      WHERE (node_type LIKE ? OR display_name LIKE ? OR description LIKE ?)
      ${sourceFilter}
      LIMIT ?
    `).all(`%${exactPhrase}%`, `%${exactPhrase}%`, `%${exactPhrase}%`, limit * 3) as NodeRow[];

    // Apply relevance ranking for exact phrase search
    const rankedNodes = rankSearchResults(nodes, exactPhrase, limit);

    const result: any = {
      query,
      results: rankedNodes.map(node => {
        const nodeResult: any = {
          nodeType: node.node_type,
          workflowNodeType: getWorkflowNodeType(node.package_name, node.node_type),
          displayName: node.display_name,
          description: node.description,
          category: node.category,
          package: node.package_name
        };

        // Add community metadata if this is a community node
        if ((node as any).is_community === 1) {
          nodeResult.isCommunity = true;
          nodeResult.isVerified = (node as any).is_verified === 1;
          if ((node as any).author_name) {
            nodeResult.authorName = (node as any).author_name;
          }
          if ((node as any).npm_downloads) {
            nodeResult.npmDownloads = (node as any).npm_downloads;
          }
        }

        return nodeResult;
      }),
      totalCount: rankedNodes.length
    };

    // Add examples if requested
    if (options?.includeExamples) {
      for (const nodeResult of result.results) {
        try {
          const examples = db.prepare(`
            SELECT
              parameters_json,
              template_name,
              template_views
            FROM template_node_configs
            WHERE node_type = ?
            ORDER BY rank
            LIMIT 2
          `).all(nodeResult.workflowNodeType) as any[];

          if (examples.length > 0) {
            nodeResult.examples = examples.map((ex: any) => ({
              configuration: JSON.parse(ex.parameters_json),
              template: ex.template_name,
              views: ex.template_views
            }));
          }
        } catch (error: any) {
          logger.warn(`Failed to fetch examples for ${nodeResult.nodeType}:`, error.message);
        }
      }
    }

    return result;
  }

  // Split into words for normal search
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);

  if (words.length === 0) {
    return { query, results: [], totalCount: 0 };
  }

  // Build conditions for each word
  const conditions = words.map(() =>
    '(node_type LIKE ? OR display_name LIKE ? OR description LIKE ?)'
  ).join(' OR ');

  const params: any[] = words.flatMap(w => [`%${w}%`, `%${w}%`, `%${w}%`]);
  // Fetch more results initially to ensure we get the best matches after ranking
  params.push(limit * 3);

  const nodes = db.prepare(`
    SELECT DISTINCT * FROM nodes
    WHERE (${conditions})
    ${sourceFilter}
    LIMIT ?
  `).all(...params) as NodeRow[];

  // Apply relevance ranking
  const rankedNodes = rankSearchResults(nodes, query, limit);

  const result: any = {
    query,
    results: rankedNodes.map(node => {
      const nodeResult: any = {
        nodeType: node.node_type,
        workflowNodeType: getWorkflowNodeType(node.package_name, node.node_type),
        displayName: node.display_name,
        description: node.description,
        category: node.category,
        package: node.package_name
      };

      // Add community metadata if this is a community node
      if ((node as any).is_community === 1) {
        nodeResult.isCommunity = true;
        nodeResult.isVerified = (node as any).is_verified === 1;
        if ((node as any).author_name) {
          nodeResult.authorName = (node as any).author_name;
        }
        if ((node as any).npm_downloads) {
          nodeResult.npmDownloads = (node as any).npm_downloads;
        }
      }

      return nodeResult;
    }),
    totalCount: rankedNodes.length
  };

  // Add examples if requested
  if (options?.includeExamples) {
    for (const nodeResult of result.results) {
      try {
        const examples = db.prepare(`
          SELECT
            parameters_json,
            template_name,
            template_views
          FROM template_node_configs
          WHERE node_type = ?
          ORDER BY rank
          LIMIT 2
        `).all(nodeResult.workflowNodeType) as any[];

        if (examples.length > 0) {
          nodeResult.examples = examples.map((ex: any) => ({
            configuration: JSON.parse(ex.parameters_json),
            template: ex.template_name,
            views: ex.template_views
          }));
        }
      } catch (error: any) {
        logger.warn(`Failed to fetch examples for ${nodeResult.nodeType}:`, error.message);
      }
    }
  }

  return result;
}

/**
 * List nodes optimized for AI tool usage
 */
export async function listAITools(repository: NodeRepository, db: DatabaseAdapter): Promise<any> {
  const tools = repository.getAITools();

  // Debug: Check if is_ai_tool column is populated
  const aiCount = db.prepare('SELECT COUNT(*) as ai_count FROM nodes WHERE is_ai_tool = 1').get() as any;

  return {
    tools,
    totalCount: tools.length,
    requirements: {
      environmentVariable: 'N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true',
      nodeProperty: 'usableAsTool: true',
    },
    usage: {
      description: 'These nodes have the usableAsTool property set to true, making them optimized for AI agent usage.',
      note: 'ANY node in n8n can be used as an AI tool by connecting it to the ai_tool port of an AI Agent node.',
      examples: [
        'Regular nodes like Slack, Google Sheets, or HTTP Request can be used as tools',
        'Connect any node to an AI Agent\'s tool port to make it available for AI-driven automation',
        'Community nodes require the environment variable to be set'
      ]
    }
  };
}

/**
 * Get documentation for a specific node
 */
export async function getNodeDocumentation(
  nodeType: string,
  db: DatabaseAdapter,
  getNodeEssentialsFunc: (nodeType: string, includeExamples?: boolean) => Promise<any>
): Promise<any> {
  // First try with normalized type
  const normalizedType = NodeTypeNormalizer.normalizeToFullForm(nodeType);
  let node = db.prepare(`
    SELECT node_type, display_name, documentation, description,
           ai_documentation_summary, ai_summary_generated_at
    FROM nodes
    WHERE node_type = ?
  `).get(normalizedType) as NodeRow | undefined;

  // If not found and normalization changed the type, try original
  if (!node && normalizedType !== nodeType) {
    node = db.prepare(`
      SELECT node_type, display_name, documentation, description,
             ai_documentation_summary, ai_summary_generated_at
      FROM nodes
      WHERE node_type = ?
    `).get(nodeType) as NodeRow | undefined;
  }

  // If still not found, try alternatives
  if (!node) {
    const alternatives = getNodeTypeAlternatives(normalizedType);

    for (const alt of alternatives) {
      node = db.prepare(`
        SELECT node_type, display_name, documentation, description,
               ai_documentation_summary, ai_summary_generated_at
        FROM nodes
        WHERE node_type = ?
      `).get(alt) as NodeRow | undefined;

      if (node) break;
    }
  }

  if (!node) {
    throw new Error(`Node ${nodeType} not found`);
  }

  // Parse AI documentation summary if present
  const aiDocSummary = node.ai_documentation_summary
    ? safeJsonParse(node.ai_documentation_summary, null)
    : null;

  // If no documentation, generate fallback with null safety
  if (!node.documentation) {
    const essentials = await getNodeEssentialsFunc(nodeType);

    return {
      nodeType: node.node_type,
      displayName: node.display_name || 'Unknown Node',
      documentation: `
# ${node.display_name || 'Unknown Node'}

${node.description || 'No description available.'}

## Common Properties

${essentials?.commonProperties?.length > 0 ?
        essentials.commonProperties.map((p: any) =>
          `### ${p.displayName || 'Property'}\n${p.description || `Type: ${p.type || 'unknown'}`}`
        ).join('\n\n') :
        'No common properties available.'}

## Note
Full documentation is being prepared. For now, use get_node_essentials for configuration help.
`,
      hasDocumentation: false,
      aiDocumentationSummary: aiDocSummary,
      aiSummaryGeneratedAt: node.ai_summary_generated_at || null,
    };
  }

  return {
    nodeType: node.node_type,
    displayName: node.display_name || 'Unknown Node',
    documentation: node.documentation,
    hasDocumentation: true,
    aiDocumentationSummary: aiDocSummary,
    aiSummaryGeneratedAt: node.ai_summary_generated_at || null,
  };
}

/**
 * Get database statistics
 */
export async function getDatabaseStatistics(db: DatabaseAdapter): Promise<any> {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(is_ai_tool) as ai_tools,
      SUM(is_trigger) as triggers,
      SUM(is_versioned) as versioned,
      SUM(CASE WHEN documentation IS NOT NULL THEN 1 ELSE 0 END) as with_docs,
      COUNT(DISTINCT package_name) as packages,
      COUNT(DISTINCT category) as categories
    FROM nodes
  `).get() as any;

  const packages = db.prepare(`
    SELECT package_name, COUNT(*) as count
    FROM nodes
    GROUP BY package_name
  `).all() as any[];

  // Get template statistics
  const templateStats = db.prepare(`
    SELECT
      COUNT(*) as total_templates,
      AVG(views) as avg_views,
      MIN(views) as min_views,
      MAX(views) as max_views
    FROM templates
  `).get() as any;

  return {
    totalNodes: stats.total,
    totalTemplates: templateStats.total_templates || 0,
    statistics: {
      aiTools: stats.ai_tools,
      triggers: stats.triggers,
      versionedNodes: stats.versioned,
      nodesWithDocumentation: stats.with_docs,
      documentationCoverage: Math.round((stats.with_docs / stats.total) * 100) + '%',
      uniquePackages: stats.packages,
      uniqueCategories: stats.categories,
      templates: {
        total: templateStats.total_templates || 0,
        avgViews: Math.round(templateStats.avg_views || 0),
        minViews: templateStats.min_views || 0,
        maxViews: templateStats.max_views || 0
      }
    },
    packageBreakdown: packages.map(pkg => ({
      package: pkg.package_name,
      nodeCount: pkg.count,
    })),
  };
}

// Helper functions

function calculateRelevance(node: NodeRow, query: string): string {
  const lowerQuery = query.toLowerCase();
  if (node.node_type.toLowerCase().includes(lowerQuery)) return 'high';
  if (node.display_name.toLowerCase().includes(lowerQuery)) return 'high';
  if (node.description?.toLowerCase().includes(lowerQuery)) return 'medium';
  return 'low';
}

function calculateRelevanceScore(node: NodeRow, query: string): number {
  const query_lower = query.toLowerCase();
  const name_lower = node.display_name.toLowerCase();
  const type_lower = node.node_type.toLowerCase();
  const type_without_prefix = type_lower.replace(/^nodes-base\./, '').replace(/^nodes-langchain\./, '');

  let score = 0;

  // Exact match in display name (highest priority)
  if (name_lower === query_lower) {
    score = 1000;
  }
  // Exact match in node type (without prefix)
  else if (type_without_prefix === query_lower) {
    score = 950;
  }
  // Special boost for common primary nodes
  else if (query_lower === 'webhook' && node.node_type === 'nodes-base.webhook') {
    score = 900;
  }
  else if ((query_lower === 'http' || query_lower === 'http request' || query_lower === 'http call') && node.node_type === 'nodes-base.httpRequest') {
    score = 900;
  }
  // Additional boost for multi-word queries matching primary nodes
  else if (query_lower.includes('http') && query_lower.includes('call') && node.node_type === 'nodes-base.httpRequest') {
    score = 890;
  }
  else if (query_lower.includes('http') && node.node_type === 'nodes-base.httpRequest') {
    score = 850;
  }
  // Boost for webhook queries
  else if (query_lower.includes('webhook') && node.node_type === 'nodes-base.webhook') {
    score = 850;
  }
  // Display name starts with query
  else if (name_lower.startsWith(query_lower)) {
    score = 800;
  }
  // Word boundary match in display name
  else if (new RegExp(`\\b${query_lower}\\b`, 'i').test(node.display_name)) {
    score = 700;
  }
  // Contains in display name
  else if (name_lower.includes(query_lower)) {
    score = 600;
  }
  // Type contains query (without prefix)
  else if (type_without_prefix.includes(query_lower)) {
    score = 500;
  }
  // Contains in description
  else if (node.description?.toLowerCase().includes(query_lower)) {
    score = 400;
  }

  return score;
}

function rankSearchResults(nodes: NodeRow[], query: string, limit: number): NodeRow[] {
  const query_lower = query.toLowerCase();

  // Calculate relevance scores for each node
  const scoredNodes = nodes.map(node => {
    const name_lower = node.display_name.toLowerCase();
    const type_lower = node.node_type.toLowerCase();
    const type_without_prefix = type_lower.replace(/^nodes-base\./, '').replace(/^nodes-langchain\./, '');

    let score = 0;

    // Exact match in display name (highest priority)
    if (name_lower === query_lower) {
      score = 1000;
    }
    // Exact match in node type (without prefix)
    else if (type_without_prefix === query_lower) {
      score = 950;
    }
    // Special boost for common primary nodes
    else if (query_lower === 'webhook' && node.node_type === 'nodes-base.webhook') {
      score = 900;
    }
    else if ((query_lower === 'http' || query_lower === 'http request' || query_lower === 'http call') && node.node_type === 'nodes-base.httpRequest') {
      score = 900;
    }
    // Boost for webhook queries
    else if (query_lower.includes('webhook') && node.node_type === 'nodes-base.webhook') {
      score = 850;
    }
    // Additional boost for http queries
    else if (query_lower.includes('http') && node.node_type === 'nodes-base.httpRequest') {
      score = 850;
    }
    // Display name starts with query
    else if (name_lower.startsWith(query_lower)) {
      score = 800;
    }
    // Word boundary match in display name
    else if (new RegExp(`\\b${query_lower}\\b`, 'i').test(node.display_name)) {
      score = 700;
    }
    // Contains in display name
    else if (name_lower.includes(query_lower)) {
      score = 600;
    }
    // Type contains query (without prefix)
    else if (type_without_prefix.includes(query_lower)) {
      score = 500;
    }
    // Contains in description
    else if (node.description?.toLowerCase().includes(query_lower)) {
      score = 400;
    }

    // For multi-word queries, check if all words are present
    const words = query_lower.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 1) {
      const allWordsInName = words.every(word => name_lower.includes(word));
      const allWordsInDesc = words.every(word => node.description?.toLowerCase().includes(word));

      if (allWordsInName) score += 200;
      else if (allWordsInDesc) score += 100;

      // Special handling for common multi-word queries
      if (query_lower === 'http call' && name_lower === 'http request') {
        score = 920; // Boost HTTP Request for "http call" query
      }
    }

    return { node, score };
  });

  // Sort by score (descending) and then by display name (ascending)
  scoredNodes.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    return a.node.display_name.localeCompare(b.node.display_name);
  });

  // Return only the requested number of results
  return scoredNodes.slice(0, limit).map(item => item.node);
}

function calculateFuzzyScore(node: NodeRow, query: string): number {
  const queryLower = query.toLowerCase();
  const displayNameLower = node.display_name.toLowerCase();
  const nodeTypeLower = node.node_type.toLowerCase();
  const nodeTypeClean = nodeTypeLower.replace(/^nodes-base\./, '').replace(/^nodes-langchain\./, '');

  // Exact match gets highest score
  if (displayNameLower === queryLower || nodeTypeClean === queryLower) {
    return 1000;
  }

  // Calculate edit distances for different parts
  const nameDistance = getEditDistance(queryLower, displayNameLower);
  const typeDistance = getEditDistance(queryLower, nodeTypeClean);

  // Also check individual words in the display name
  const nameWords = displayNameLower.split(/\s+/);
  let minWordDistance = Infinity;
  for (const word of nameWords) {
    const distance = getEditDistance(queryLower, word);
    if (distance < minWordDistance) {
      minWordDistance = distance;
    }
  }

  // Calculate best match score
  const bestDistance = Math.min(nameDistance, typeDistance, minWordDistance);

  // Use the length of the matched word for similarity calculation
  let matchedLen = queryLower.length;
  if (minWordDistance === bestDistance) {
    // Find which word matched best
    for (const word of nameWords) {
      if (getEditDistance(queryLower, word) === minWordDistance) {
        matchedLen = Math.max(queryLower.length, word.length);
        break;
      }
    }
  } else if (typeDistance === bestDistance) {
    matchedLen = Math.max(queryLower.length, nodeTypeClean.length);
  } else {
    matchedLen = Math.max(queryLower.length, displayNameLower.length);
  }

  const similarity = 1 - (bestDistance / matchedLen);

  // Boost if query is a substring
  if (displayNameLower.includes(queryLower) || nodeTypeClean.includes(queryLower)) {
    return 800 + (similarity * 100);
  }

  // Check if it's a prefix match
  if (displayNameLower.startsWith(queryLower) ||
    nodeTypeClean.startsWith(queryLower) ||
    nameWords.some(w => w.startsWith(queryLower))) {
    return 700 + (similarity * 100);
  }

  // Allow up to 1-2 character differences for typos
  if (bestDistance <= 2) {
    return 500 + ((2 - bestDistance) * 100) + (similarity * 50);
  }

  // Allow up to 3 character differences for longer words
  if (bestDistance <= 3 && queryLower.length >= 4) {
    return 400 + ((3 - bestDistance) * 50) + (similarity * 50);
  }

  // Base score on similarity
  return similarity * 300;
}

function getEditDistance(s1: string, s2: string): number {
  // Simple Levenshtein distance implementation
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

function safeJsonParse(json: string, defaultValue: any = null): any {
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
}
