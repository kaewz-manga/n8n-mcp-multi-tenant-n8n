-- Migration: Add template_node_configs table
-- Run during `npm run rebuild` or `npm run fetch:templates`
-- This migration is idempotent - safe to run multiple times

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS template_node_configs (
  id INTEGER PRIMARY KEY,
  node_type TEXT NOT NULL,
  template_id INTEGER NOT NULL,
  template_name TEXT NOT NULL,
  template_views INTEGER DEFAULT 0,

  -- Node configuration (extracted from workflow)
  node_name TEXT,                  -- Node name in workflow (e.g., "HTTP Request")
  parameters_json TEXT NOT NULL,   -- JSON: node.parameters
  credentials_json TEXT,            -- JSON: node.credentials (if present)

  -- Pre-calculated metadata for filtering
  has_credentials INTEGER DEFAULT 0,
  has_expressions INTEGER DEFAULT 0,  -- Contains {{...}} or $json/$node
  complexity TEXT CHECK(complexity IN ('simple', 'medium', 'complex')),
  use_cases TEXT,                   -- JSON array from template.metadata.use_cases

  -- Pre-calculated ranking (1 = best, 2 = second best, etc.)
  rank INTEGER DEFAULT 0,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_config_node_type_rank
  ON template_node_configs(node_type, rank);

CREATE INDEX IF NOT EXISTS idx_config_complexity
  ON template_node_configs(node_type, complexity, rank);

CREATE INDEX IF NOT EXISTS idx_config_auth
  ON template_node_configs(node_type, has_credentials, rank);

-- Create view if it doesn't exist
CREATE VIEW IF NOT EXISTS ranked_node_configs AS
SELECT
  node_type,
  template_name,
  template_views,
  parameters_json,
  credentials_json,
  has_credentials,
  has_expressions,
  complexity,
  use_cases,
  rank
FROM template_node_configs
WHERE rank <= 5  -- Top 5 per node type
ORDER BY node_type, rank;

-- Note: Actual data population is handled by the fetch-templates script
-- This migration only creates the schema
