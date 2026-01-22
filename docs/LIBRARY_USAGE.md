# Library Usage Guide - Multi-Tenant / Hosted Deployments

This guide covers using n8n-mcp as a library dependency for building multi-tenant hosted services.

## Overview

n8n-mcp can be used as a Node.js library to build multi-tenant backends that provide MCP services to multiple users or instances. The package exports all necessary components for integration into your existing services.

## Installation

```bash
npm install n8n-mcp
```

## Core Concepts

### Library Mode vs CLI Mode

- **CLI Mode** (default): Single-player usage via `npx n8n-mcp` or Docker
- **Library Mode**: Multi-tenant usage by importing and using the `N8NMCPEngine` class

### Instance Context

The `InstanceContext` type allows you to pass per-request configuration to the MCP engine:

```typescript
interface InstanceContext {
  // Instance-specific n8n API configuration
  n8nApiUrl?: string;
  n8nApiKey?: string;
  n8nApiTimeout?: number;
  n8nApiMaxRetries?: number;

  // Instance identification
  instanceId?: string;
  sessionId?: string;

  // Extensible metadata
  metadata?: Record<string, any>;
}
```

## Basic Example

```typescript
import express from 'express';
import { N8NMCPEngine } from 'n8n-mcp';

const app = express();
const mcpEngine = new N8NMCPEngine({
  sessionTimeout: 3600000, // 1 hour
  logLevel: 'info'
});

// Handle MCP requests with per-user context
app.post('/mcp', async (req, res) => {
  const instanceContext = {
    n8nApiUrl: req.user.n8nUrl,
    n8nApiKey: req.user.n8nApiKey,
    instanceId: req.user.id
  };

  await mcpEngine.processRequest(req, res, instanceContext);
});

app.listen(3000);
```

## Multi-Tenant Backend Example

This example shows a complete multi-tenant implementation with user authentication and instance management:

```typescript
import express from 'express';
import { N8NMCPEngine, InstanceContext, validateInstanceContext } from 'n8n-mcp';

const app = express();
const mcpEngine = new N8NMCPEngine({
  sessionTimeout: 3600000, // 1 hour
  logLevel: 'info'
});

// Start MCP engine
await mcpEngine.start();

// Authentication middleware
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Verify token and attach user to request
  req.user = await getUserFromToken(token);
  next();
};

// Get instance configuration from database
const getInstanceConfig = async (instanceId: string, userId: string) => {
  // Your database logic here
  const instance = await db.instances.findOne({
    where: { id: instanceId, userId }
  });

  if (!instance) {
    throw new Error('Instance not found');
  }

  return {
    n8nApiUrl: instance.n8nUrl,
    n8nApiKey: await decryptApiKey(instance.encryptedApiKey),
    instanceId: instance.id
  };
};

// MCP endpoint with per-instance context
app.post('/api/instances/:instanceId/mcp', authenticate, async (req, res) => {
  try {
    // Get instance configuration
    const instance = await getInstanceConfig(req.params.instanceId, req.user.id);

    // Create instance context
    const context: InstanceContext = {
      n8nApiUrl: instance.n8nApiUrl,
      n8nApiKey: instance.n8nApiKey,
      instanceId: instance.instanceId,
      metadata: {
        userId: req.user.id,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      }
    };

    // Validate context before processing
    const validation = validateInstanceContext(context);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid instance configuration',
        details: validation.errors
      });
    }

    // Process request with instance context
    await mcpEngine.processRequest(req, res, context);

  } catch (error) {
    console.error('MCP request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health endpoint
app.get('/health', async (req, res) => {
  const health = await mcpEngine.healthCheck();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await mcpEngine.shutdown();
  process.exit(0);
});

app.listen(3000);
```

## API Reference

### N8NMCPEngine

#### Constructor

```typescript
new N8NMCPEngine(options?: {
  sessionTimeout?: number;  // Session TTL in ms (default: 1800000 = 30min)
  logLevel?: 'error' | 'warn' | 'info' | 'debug';  // Default: 'info'
})
```

#### Methods

##### `async processRequest(req, res, context?)`

Process a single MCP request with optional instance context.

**Parameters:**
- `req`: Express request object
- `res`: Express response object
- `context` (optional): InstanceContext with per-instance configuration

**Example:**
```typescript
const context: InstanceContext = {
  n8nApiUrl: 'https://instance1.n8n.cloud',
  n8nApiKey: 'instance1-key',
  instanceId: 'tenant-123'
};

await engine.processRequest(req, res, context);
```

##### `async healthCheck()`

Get engine health status for monitoring.

**Returns:** `EngineHealth`
```typescript
{
  status: 'healthy' | 'unhealthy';
  uptime: number;  // seconds
  sessionActive: boolean;
  memoryUsage: {
    used: number;
    total: number;
    unit: string;
  };
  version: string;
}
```

**Example:**
```typescript
app.get('/health', async (req, res) => {
  const health = await engine.healthCheck();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

##### `getSessionInfo()`

Get current session information for debugging.

**Returns:**
```typescript
{
  active: boolean;
  sessionId?: string;
  age?: number;  // milliseconds
  sessions?: {
    total: number;
    active: number;
    expired: number;
    max: number;
    sessionIds: string[];
  };
}
```

##### `async start()`

Start the engine (for standalone mode). Not needed when using `processRequest()` directly.

##### `async shutdown()`

Graceful shutdown for service lifecycle management.

**Example:**
```typescript
process.on('SIGTERM', async () => {
  await engine.shutdown();
  process.exit(0);
});
```

### Types

#### InstanceContext

Configuration for a specific user instance:

```typescript
interface InstanceContext {
  n8nApiUrl?: string;
  n8nApiKey?: string;
  n8nApiTimeout?: number;
  n8nApiMaxRetries?: number;
  instanceId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}
```

#### Validation Functions

##### `validateInstanceContext(context: InstanceContext)`

Validate and sanitize instance context.

**Returns:**
```typescript
{
  valid: boolean;
  errors?: string[];
}
```

**Example:**
```typescript
import { validateInstanceContext } from 'n8n-mcp';

const validation = validateInstanceContext(context);
if (!validation.valid) {
  console.error('Invalid context:', validation.errors);
}
```

##### `isInstanceContext(obj: any)`

Type guard to check if an object is a valid InstanceContext.

**Example:**
```typescript
import { isInstanceContext } from 'n8n-mcp';

if (isInstanceContext(req.body.context)) {
  // TypeScript knows this is InstanceContext
  await engine.processRequest(req, res, req.body.context);
}
```

## Session Management

### Session Strategies

The MCP engine supports flexible session ID formats:

- **UUIDv4**: Internal n8n-mcp format (default)
- **Instance-prefixed**: `instance-{userId}-{hash}-{uuid}` for multi-tenant isolation
- **Custom formats**: Any non-empty string for mcp-remote and other proxies

Session validation happens via transport lookup, not format validation. This ensures compatibility with all MCP clients.

### Multi-Tenant Configuration

Set these environment variables for multi-tenant mode:

```bash
# Enable multi-tenant mode
ENABLE_MULTI_TENANT=true

# Session strategy: "instance" (default) or "shared"
MULTI_TENANT_SESSION_STRATEGY=instance
```

**Session Strategies:**

- **instance** (recommended): Each tenant gets isolated sessions
  - Session ID: `instance-{instanceId}-{configHash}-{uuid}`
  - Better isolation and security
  - Easier debugging per tenant

- **shared**: Multiple tenants share sessions with context switching
  - More efficient for high tenant count
  - Requires careful context management

## Security Considerations

### API Key Management

Always encrypt API keys server-side:

```typescript
import { createCipheriv, createDecipheriv } from 'crypto';

// Encrypt before storing
const encryptApiKey = (apiKey: string) => {
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  return cipher.update(apiKey, 'utf8', 'hex') + cipher.final('hex');
};

// Decrypt before using
const decryptApiKey = (encrypted: string) => {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
};

// Use decrypted key in context
const context: InstanceContext = {
  n8nApiKey: await decryptApiKey(instance.encryptedApiKey),
  // ...
};
```

### Input Validation

Always validate instance context before processing:

```typescript
import { validateInstanceContext } from 'n8n-mcp';

const validation = validateInstanceContext(context);
if (!validation.valid) {
  throw new Error(`Invalid context: ${validation.errors?.join(', ')}`);
}
```

### Rate Limiting

Implement rate limiting per tenant:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  keyGenerator: (req) => req.user?.id || req.ip
});

app.post('/api/instances/:instanceId/mcp', authenticate, limiter, async (req, res) => {
  // ...
});
```

## Error Handling

Always wrap MCP requests in try-catch blocks:

```typescript
app.post('/api/instances/:instanceId/mcp', authenticate, async (req, res) => {
  try {
    const context = await getInstanceConfig(req.params.instanceId, req.user.id);
    await mcpEngine.processRequest(req, res, context);
  } catch (error) {
    console.error('MCP error:', error);

    // Don't leak internal errors to clients
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});
```

## Monitoring

### Health Checks

Set up periodic health checks:

```typescript
setInterval(async () => {
  const health = await mcpEngine.healthCheck();

  if (health.status === 'unhealthy') {
    console.error('MCP engine unhealthy:', health);
    // Alert your monitoring system
  }

  // Log metrics
  console.log('MCP engine metrics:', {
    uptime: health.uptime,
    memory: health.memoryUsage,
    sessionActive: health.sessionActive
  });
}, 60000); // Every minute
```

### Session Monitoring

Track active sessions:

```typescript
app.get('/admin/sessions', authenticate, async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const sessionInfo = mcpEngine.getSessionInfo();
  res.json(sessionInfo);
});
```

## Testing

### Unit Testing

```typescript
import { N8NMCPEngine, InstanceContext } from 'n8n-mcp';

describe('MCP Engine', () => {
  let engine: N8NMCPEngine;

  beforeEach(() => {
    engine = new N8NMCPEngine({ logLevel: 'error' });
  });

  afterEach(async () => {
    await engine.shutdown();
  });

  it('should process request with context', async () => {
    const context: InstanceContext = {
      n8nApiUrl: 'https://test.n8n.io',
      n8nApiKey: 'test-key',
      instanceId: 'test-instance'
    };

    const mockReq = createMockRequest();
    const mockRes = createMockResponse();

    await engine.processRequest(mockReq, mockRes, context);

    expect(mockRes.status).toBe(200);
  });
});
```

### Integration Testing

```typescript
import request from 'supertest';
import { createApp } from './app';

describe('Multi-tenant MCP API', () => {
  let app;
  let authToken;

  beforeAll(async () => {
    app = await createApp();
    authToken = await getTestAuthToken();
  });

  it('should handle MCP request for instance', async () => {
    const response = await request(app)
      .post('/api/instances/test-instance/mcp')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {}
        },
        id: 1
      });

    expect(response.status).toBe(200);
    expect(response.body.result).toBeDefined();
  });
});
```

## Deployment Considerations

### Environment Variables

```bash
# Required for multi-tenant mode
ENABLE_MULTI_TENANT=true
MULTI_TENANT_SESSION_STRATEGY=instance

# Optional: Logging
LOG_LEVEL=info
DISABLE_CONSOLE_OUTPUT=false

# Optional: Session configuration
SESSION_TIMEOUT=1800000  # 30 minutes in milliseconds
N8N_MCP_MAX_SESSIONS=100  # Maximum concurrent sessions (default: 100)

# Optional: Performance
NODE_ENV=production
```

### Docker Deployment

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production
ENV ENABLE_MULTI_TENANT=true
ENV LOG_LEVEL=info

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: n8n-mcp-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: n8n-mcp-backend
  template:
    metadata:
      labels:
        app: n8n-mcp-backend
    spec:
      containers:
      - name: backend
        image: your-registry/n8n-mcp-backend:latest
        ports:
        - containerPort: 3000
        env:
        - name: ENABLE_MULTI_TENANT
          value: "true"
        - name: LOG_LEVEL
          value: "info"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
```

## Examples

### Complete Multi-Tenant SaaS Example

For a complete implementation example, see:
- [n8n-mcp-backend](https://github.com/czlonkowski/n8n-mcp-backend) - Full hosted service implementation

### Migration from Single-Player

If you're migrating from single-player (CLI/Docker) to multi-tenant:

1. **Keep backward compatibility** - Use environment fallback:
```typescript
const context: InstanceContext = {
  n8nApiUrl: instanceUrl || process.env.N8N_API_URL,
  n8nApiKey: instanceKey || process.env.N8N_API_KEY,
  instanceId: instanceId || 'default'
};
```

2. **Gradual rollout** - Start with a feature flag:
```typescript
const isMultiTenant = process.env.ENABLE_MULTI_TENANT === 'true';

if (isMultiTenant) {
  const context = await getInstanceConfig(req.params.instanceId);
  await engine.processRequest(req, res, context);
} else {
  // Legacy single-player mode
  await engine.processRequest(req, res);
}
```

## Troubleshooting

### Common Issues

#### Module Resolution Errors

If you see `Cannot find module 'n8n-mcp'`:

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Verify package has types field
npm info n8n-mcp

# Check TypeScript can resolve it
npx tsc --noEmit
```

#### Session ID Validation Errors

If you see `Invalid session ID format` errors:

- Ensure you're using n8n-mcp v2.18.9 or later
- Session IDs can be any non-empty string
- No need to generate UUIDs - use your own format

#### Memory Leaks

If memory usage grows over time:

```typescript
// Ensure proper cleanup
process.on('SIGTERM', async () => {
  await engine.shutdown();
  process.exit(0);
});

// Monitor session count
const sessionInfo = engine.getSessionInfo();
console.log('Active sessions:', sessionInfo.sessions?.active);
```

## Further Reading

- [MCP Protocol Specification](https://modelcontextprotocol.io/docs)
- [n8n API Documentation](https://docs.n8n.io/api/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [n8n-mcp Main README](../README.md)

## Support

- **Issues**: [GitHub Issues](https://github.com/czlonkowski/n8n-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/czlonkowski/n8n-mcp/discussions)
- **Security**: For security issues, see [SECURITY.md](../SECURITY.md)
