#!/usr/bin/env npx tsx

import { createDatabaseAdapter } from '../database/database-adapter';
import { NodeRepository } from '../database/node-repository';
import { NodeSimilarityService } from '../services/node-similarity-service';
import path from 'path';

async function debugHttpSearch() {
  const dbPath = path.join(process.cwd(), 'data/nodes.db');
  const db = await createDatabaseAdapter(dbPath);
  const repository = new NodeRepository(db);
  const service = new NodeSimilarityService(repository);

  console.log('Testing "http" search...\n');

  // Check if httpRequest exists
  const httpNode = repository.getNode('nodes-base.httpRequest');
  console.log('HTTP Request node exists:', httpNode ? 'Yes' : 'No');
  if (httpNode) {
    console.log('  Display name:', httpNode.displayName);
  }

  // Test the search with internal details
  const suggestions = await service.findSimilarNodes('http', 5);
  console.log('\nSuggestions for "http":', suggestions.length);
  suggestions.forEach(s => {
    console.log(`  - ${s.nodeType} (${Math.round(s.confidence * 100)}%)`);
  });

  // Manually calculate score for httpRequest
  console.log('\nManual score calculation for httpRequest:');
  const testNode = {
    nodeType: 'nodes-base.httpRequest',
    displayName: 'HTTP Request',
    category: 'Core Nodes'
  };

  const cleanInvalid = 'http';
  const cleanValid = 'nodesbasehttprequest';
  const displayNameClean = 'httprequest';

  // Check substring
  const hasSubstring = cleanValid.includes(cleanInvalid) || displayNameClean.includes(cleanInvalid);
  console.log(`  Substring match: ${hasSubstring}`);

  // This should give us pattern match score
  const patternScore = hasSubstring ? 35 : 0; // Using 35 for short searches
  console.log(`  Pattern score: ${patternScore}`);

  // Name similarity would be low
  console.log(`  Total score would need to be >= 50 to appear`);

  // Get all nodes and check which ones contain 'http'
  const allNodes = repository.getAllNodes();
  const httpNodes = allNodes.filter(n =>
    n.nodeType.toLowerCase().includes('http') ||
    (n.displayName && n.displayName.toLowerCase().includes('http'))
  );

  console.log('\n\nNodes containing "http" in name:');
  httpNodes.slice(0, 5).forEach(n => {
    console.log(`  - ${n.nodeType} (${n.displayName})`);

    // Calculate score for this node
    const normalizedSearch = 'http';
    const normalizedType = n.nodeType.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedDisplay = (n.displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const containsInType = normalizedType.includes(normalizedSearch);
    const containsInDisplay = normalizedDisplay.includes(normalizedSearch);

    console.log(`    Type check: "${normalizedType}" includes "${normalizedSearch}" = ${containsInType}`);
    console.log(`    Display check: "${normalizedDisplay}" includes "${normalizedSearch}" = ${containsInDisplay}`);
  });
}

debugHttpSearch().catch(console.error);