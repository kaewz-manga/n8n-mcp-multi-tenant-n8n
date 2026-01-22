# n8n MCP Multi-tenant Server (n8n Compatible)

> **Forked from**: [n8n-mcp-multi-tenant](https://github.com/kaewz-manga/n8n-mcp-multi-tenant)  
> **Modified for**: Full n8n MCP Client compatibility

## What's Different?

This version adds **SSE-to-JSON middleware** to make the multi-tenant MCP server work with n8n MCP Client.

### Problem

- Original repo uses MCP SDK's 
- MCP SDK requires: `Accept: application/json, text/event-stream`
- n8n MCP Client sends: `Accept: application/json` (no SSE)
- Result: **401 Not Acceptable** error

### Solution

Added middleware to:
1. **Inject SSE header** for SDK validation
2. **Convert SSE responses to JSON** for n8n compatibility



## Features

✅ **Multi-tenant mode** - Multiple n8n instances can use one MCP server  
✅ **n8n compatible** - Works with n8n MCP Client out of the box  
✅ **No access tokens** - Simple `x-n8n-url` + `x-n8n-key` headers  
✅ **Rate limiting** - Per-instance limits  
✅ **Memory limits** - 512MB container limit to prevent leaks

## Quick Start

### 1. Environment Variables

```env
# Multi-tenant mode
ENABLE_MULTI_TENANT=true
MULTI_TENANT_SESSION_STRATEGY=instance

# MCP mode
MCP_MODE=http
PORT=3000

# Auth (for backwards compatibility)
AUTH_TOKEN=your-server-token

# Rate limits
RATE_LIMIT_PER_MINUTE=50
DAILY_LIMIT=100
```

### 2. Docker Compose

```yaml
version: 3.8

services:
  n8n-mcp-dynamic:
    build: .
    ports:
      - 127.0.0.1:3011:3000
    environment:
      - ENABLE_MULTI_TENANT=true
      - MCP_MODE=http
      - PORT=3000
    mem_limit: 512m
    restart: unless-stopped
```

### 3. n8n Configuration

Add MCP Client in n8n with:

**URL**: `https://your-domain.com/mcp`

**Headers**:
```
x-n8n-url: https://your-n8n-instance.com
x-n8n-key: your-n8n-api-key
```

## Testing

```bash
# Initialize session
curl -X POST https://your-domain.com/mcp   -H Content-Type: application/json   -H Accept: application/json   -H x-n8n-url: https://your-n8n.com   -H x-n8n-key: your-api-key   -d '{jsonrpc:2.0,method:initialize,params:{protocolVersion:2024-11-05,capabilities:{},clientInfo:{name:n8n,version:1.0.0}},id:1}'

# Expected response (JSON, not SSE):
# {result:{protocolVersion:2024-11-05,capabilities:{tools:{}},serverInfo:{name:n8n-documentation-mcp,version:2.33.2}},jsonrpc:2.0,id:1}
```

## Key Changes

| File | Change | Reason |
|------|--------|--------|
| `src/http-server-single-session.ts` | Added SSE-to-JSON middleware (line ~785) | n8n doesn't send SSE header |
| `docker-compose.yml` | Updated environment variables | Multi-tenant configuration |

## Differences from Original

| Feature | Original | This Version |
|---------|----------|--------------|
| **n8n Compatible** | ❌ No (requires SSE) | ✅ Yes (auto-converts) |
| **Access Tokens** | ✅ Has Access Token Layer | ❌ Removed (not needed) |
| **Response Format** | SSE only | JSON + SSE (auto-detect) |
| **Headers Required** | `x-access-token` + `x-n8n-url/key` | `x-n8n-url` + `x-n8n-key` only |

## License

MIT (same as original)

## Credits

Based on [n8n-mcp-multi-tenant](https://github.com/kaewz-manga/n8n-mcp-multi-tenant)  
Modified by: kaewz-manga  
Date: 2026-01-22
