# Template Update Process - Quick Reference

## Overview

The n8n-mcp project maintains a database of workflow templates from n8n.io. This guide explains how to update the template database incrementally without rebuilding from scratch.

## Current Database State

As of the last update:
- **2,598 templates** in database
- Templates from the last 12 months
- Latest template: September 12, 2025

## Quick Commands

### Incremental Update (Recommended)
```bash
# Build if needed
npm run build

# Fetch only NEW templates (5-10 minutes)
npm run fetch:templates:update
```

### Full Rebuild (Rare)
```bash
# Rebuild entire database from scratch (30-40 minutes)
npm run fetch:templates
```

## How It Works

### Incremental Update Mode (`--update`)

The incremental update is **smart and efficient**:

1. **Loads existing template IDs** from database (~2,598 templates)
2. **Fetches template list** from n8n.io API (all templates from last 12 months)
3. **Filters** to find only NEW templates not in database
4. **Fetches details** for new templates only (saves time and API calls)
5. **Saves** new templates to database (existing ones untouched)
6. **Rebuilds FTS5** search index for new templates

### Key Benefits

✅ **Non-destructive**: All existing templates preserved
✅ **Fast**: Only fetches new templates (5-10 min vs 30-40 min)
✅ **API friendly**: Reduces load on n8n.io API
✅ **Safe**: Preserves AI-generated metadata
✅ **Smart**: Automatically skips duplicates

## Performance Comparison

| Mode | Templates Fetched | Time | Use Case |
|------|------------------|------|----------|
| **Update** | Only new (~50-200) | 5-10 min | Regular updates |
| **Rebuild** | All (~8000+) | 30-40 min | Initial setup or corruption |

## Command Options

### Basic Update
```bash
npm run fetch:templates:update
```

### Full Rebuild
```bash
npm run fetch:templates
```

### With Metadata Generation
```bash
# Update templates and generate AI metadata
npm run fetch:templates -- --update --generate-metadata

# Or just generate metadata for existing templates
npm run fetch:templates -- --metadata-only
```

### Help
```bash
npm run fetch:templates -- --help
```

## Update Frequency

Recommended update schedule:
- **Weekly**: Run incremental update to get latest templates
- **Monthly**: Review database statistics
- **As needed**: Rebuild only if database corruption suspected

## Template Filtering

The fetcher automatically filters templates:
- ✅ **Includes**: Templates from last 12 months
- ✅ **Includes**: Templates with >10 views
- ❌ **Excludes**: Templates with ≤10 views (too niche)
- ❌ **Excludes**: Templates older than 12 months

## Workflow

### Regular Update Workflow

```bash
# 1. Check current state
sqlite3 data/nodes.db "SELECT COUNT(*) FROM templates"

# 2. Build project (if code changed)
npm run build

# 3. Run incremental update
npm run fetch:templates:update

# 4. Verify new templates added
sqlite3 data/nodes.db "SELECT COUNT(*) FROM templates"
```

### After n8n Dependency Update

When you update n8n dependencies, templates remain compatible:
```bash
# 1. Update n8n (from MEMORY_N8N_UPDATE.md)
npm run update:all

# 2. Fetch new templates incrementally
npm run fetch:templates:update

# 3. Check how many templates were added
sqlite3 data/nodes.db "SELECT COUNT(*) FROM templates"

# 4. Generate AI metadata for new templates (optional, requires OPENAI_API_KEY)
npm run fetch:templates -- --metadata-only

# 5. IMPORTANT: Sanitize templates before pushing database
npm run build
npm run sanitize:templates
```

Templates are independent of n8n version - they're just workflow JSON data.

**CRITICAL**: Always run `npm run sanitize:templates` before pushing the database to remove API tokens from template workflows.

**Note**: New templates fetched via `--update` mode will NOT have AI-generated metadata by default. You need to run `--metadata-only` separately to generate metadata for templates that don't have it yet.

## Troubleshooting

### No New Templates Found

This is normal! It means:
- All recent templates are already in your database
- n8n.io hasn't published many new templates recently
- Your database is up to date

```bash
📊 Update mode: 0 new templates to fetch (skipping 2598 existing)
✅ All templates already have metadata
```

### API Rate Limiting

If you hit rate limits:
- The fetcher includes built-in delays (150ms between requests)
- Wait a few minutes and try again
- Use `--update` mode instead of full rebuild

### Database Corruption

If you suspect corruption:
```bash
# Full rebuild from scratch
npm run fetch:templates

# This will:
# - Drop and recreate templates table
# - Fetch all templates fresh
# - Rebuild search indexes
```

## Database Schema

Templates are stored with:
- Basic info (id, name, description, author, views, created_at)
- Node types used (JSON array)
- Complete workflow (gzip compressed, base64 encoded)
- AI-generated metadata (optional, requires OpenAI API key)
- FTS5 search index for fast text search

## Metadata Generation

Generate AI metadata for templates:
```bash
# Requires OPENAI_API_KEY in .env
export OPENAI_API_KEY="sk-..."

# Generate for templates without metadata (recommended after incremental update)
npm run fetch:templates -- --metadata-only

# Generate during template fetch (slower, but automatic)
npm run fetch:templates:update -- --generate-metadata
```

**Important**: Incremental updates (`--update`) do NOT generate metadata by default. After running `npm run fetch:templates:update`, you'll have new templates without metadata. Run `--metadata-only` separately to generate metadata for them.

### Check Metadata Coverage

```bash
# See how many templates have metadata
sqlite3 data/nodes.db "SELECT
  COUNT(*) as total,
  SUM(CASE WHEN metadata_json IS NOT NULL THEN 1 ELSE 0 END) as with_metadata,
  SUM(CASE WHEN metadata_json IS NULL THEN 1 ELSE 0 END) as without_metadata
FROM templates"

# See recent templates without metadata
sqlite3 data/nodes.db "SELECT id, name, created_at
FROM templates
WHERE metadata_json IS NULL
ORDER BY created_at DESC
LIMIT 10"
```

Metadata includes:
- Categories
- Complexity level (simple/medium/complex)
- Use cases
- Estimated setup time
- Required services
- Key features
- Target audience

### Metadata Generation Troubleshooting

If metadata generation fails:

1. **Check error file**: Errors are saved to `temp/batch/batch_*_error.jsonl`
2. **Common issues**:
   - `"Unsupported value: 'temperature'"` - Model doesn't support custom temperature
   - `"Invalid request"` - Check OPENAI_API_KEY is valid
   - Model availability issues
3. **Model**: Uses `gpt-5-mini-2025-08-07` by default
4. **Token limit**: 3000 tokens per request for detailed metadata

The system will automatically:
- Process error files and assign default metadata to failed templates
- Save error details for debugging
- Continue processing even if some templates fail

**Example error handling**:
```bash
# If you see: "No output file available for batch job"
# Check: temp/batch/batch_*_error.jsonl for error details
# The system now automatically processes errors and generates default metadata
```

## Environment Variables

Optional configuration:
```bash
# OpenAI for metadata generation
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # Default model
OPENAI_BATCH_SIZE=50      # Batch size for metadata generation

# Metadata generation limits
METADATA_LIMIT=100        # Max templates to process (0 = all)
```

## Statistics

After update, check stats:
```bash
# Template count
sqlite3 data/nodes.db "SELECT COUNT(*) FROM templates"

# Most recent template
sqlite3 data/nodes.db "SELECT MAX(created_at) FROM templates"

# Templates by view count
sqlite3 data/nodes.db "SELECT COUNT(*),
  CASE
    WHEN views < 50 THEN '<50'
    WHEN views < 100 THEN '50-100'
    WHEN views < 500 THEN '100-500'
    ELSE '500+'
  END as view_range
  FROM templates GROUP BY view_range"
```

## Integration with n8n-mcp

Templates are available through MCP tools:
- `list_templates`: List all templates
- `get_template`: Get specific template with workflow
- `search_templates`: Search by keyword
- `list_node_templates`: Templates using specific nodes
- `get_templates_for_task`: Templates for common tasks
- `search_templates_by_metadata`: Advanced filtering

See `npm run test:templates` for usage examples.

## Time Estimates

Typical incremental update:
- Loading existing IDs: 1-2 seconds
- Fetching template list: 2-3 minutes
- Filtering new templates: instant
- Fetching details for 100 new templates: ~15 seconds (0.15s each)
- Saving and indexing: 5-10 seconds
- **Total: 3-5 minutes**

Full rebuild:
- Fetching 8000+ templates: 25-30 minutes
- Saving and indexing: 5-10 minutes
- **Total: 30-40 minutes**

## Best Practices

1. **Use incremental updates** for regular maintenance
2. **Rebuild only when necessary** (corruption, major changes)
3. **Generate metadata incrementally** to avoid OpenAI costs
4. **Monitor template count** to verify updates working
5. **Keep database backed up** before major operations

## Next Steps

After updating templates:
1. Test template search: `npm run test:templates`
2. Verify MCP tools work: Test in Claude Desktop
3. Check statistics in database
4. Commit changes if desired (database changes)

## Related Documentation

- `MEMORY_N8N_UPDATE.md` - Updating n8n dependencies
- `CLAUDE.md` - Project overview and architecture
- `README.md` - User documentation