/**
 * Search utility functions for node discovery
 */

import { NodeRow } from '../types';

/**
 * Calculate fuzzy matching score for a node against a query
 */
export function calculateFuzzyScore(node: NodeRow, query: string): number {
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

/**
 * Calculate Levenshtein edit distance between two strings
 */
export function getEditDistance(s1: string, s2: string): number {
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

/**
 * Calculate qualitative relevance level (high/medium/low)
 */
export function calculateRelevance(node: NodeRow, query: string): string {
  const lowerQuery = query.toLowerCase();
  if (node.node_type.toLowerCase().includes(lowerQuery)) return 'high';
  if (node.display_name.toLowerCase().includes(lowerQuery)) return 'high';
  if (node.description?.toLowerCase().includes(lowerQuery)) return 'medium';
  return 'low';
}

/**
 * Calculate numeric relevance score for sorting
 */
export function calculateRelevanceScore(node: NodeRow, query: string): number {
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

/**
 * Rank and sort search results by relevance
 */
export function rankSearchResults(nodes: NodeRow[], query: string, limit: number): NodeRow[] {
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
