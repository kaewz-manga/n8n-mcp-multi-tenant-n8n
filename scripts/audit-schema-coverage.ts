/**
 * Database Schema Coverage Audit Script
 *
 * Audits the database to determine how many nodes have complete schema information
 * for resourceLocator mode validation. This helps assess the coverage of our
 * schema-driven validation approach.
 */

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../data/nodes.db');
const db = new Database(dbPath, { readonly: true });

console.log('=== Schema Coverage Audit ===\n');

// Query 1: How many nodes have resourceLocator properties?
const totalResourceLocator = db.prepare(`
  SELECT COUNT(*) as count FROM nodes
  WHERE properties_schema LIKE '%resourceLocator%'
`).get() as { count: number };

console.log(`Nodes with resourceLocator properties: ${totalResourceLocator.count}`);

// Query 2: Of those, how many have modes defined?
const withModes = db.prepare(`
  SELECT COUNT(*) as count FROM nodes
  WHERE properties_schema LIKE '%resourceLocator%'
    AND properties_schema LIKE '%modes%'
`).get() as { count: number };

console.log(`Nodes with modes defined: ${withModes.count}`);

// Query 3: Which nodes have resourceLocator but NO modes?
const withoutModes = db.prepare(`
  SELECT node_type, display_name
  FROM nodes
  WHERE properties_schema LIKE '%resourceLocator%'
    AND properties_schema NOT LIKE '%modes%'
  LIMIT 10
`).all() as Array<{ node_type: string; display_name: string }>;

console.log(`\nSample nodes WITHOUT modes (showing 10):`);
withoutModes.forEach(node => {
  console.log(`  - ${node.display_name} (${node.node_type})`);
});

// Calculate coverage percentage
const coverage = totalResourceLocator.count > 0
  ? (withModes.count / totalResourceLocator.count) * 100
  : 0;

console.log(`\nSchema coverage: ${coverage.toFixed(1)}% of resourceLocator nodes have modes defined`);

// Query 4: Get some examples of nodes WITH modes for verification
console.log('\nSample nodes WITH modes (showing 5):');
const withModesExamples = db.prepare(`
  SELECT node_type, display_name
  FROM nodes
  WHERE properties_schema LIKE '%resourceLocator%'
    AND properties_schema LIKE '%modes%'
  LIMIT 5
`).all() as Array<{ node_type: string; display_name: string }>;

withModesExamples.forEach(node => {
  console.log(`  - ${node.display_name} (${node.node_type})`);
});

// Summary
console.log('\n=== Summary ===');
console.log(`Total nodes in database: ${db.prepare('SELECT COUNT(*) as count FROM nodes').get() as any as { count: number }.count}`);
console.log(`Nodes with resourceLocator: ${totalResourceLocator.count}`);
console.log(`Nodes with complete mode schemas: ${withModes.count}`);
console.log(`Nodes without mode schemas: ${totalResourceLocator.count - withModes.count}`);
console.log(`\nImplication: Schema-driven validation will apply to ${withModes.count} nodes.`);
console.log(`For the remaining ${totalResourceLocator.count - withModes.count} nodes, validation will be skipped (graceful degradation).`);

db.close();
