# Session Persistence API - Production Guide

## Overview

The Session Persistence API enables zero-downtime container deployments in multi-tenant n8n-mcp environments. It allows you to export active MCP session state before shutdown and restore it after restart, maintaining session continuity across container lifecycle events.

**Version:** 2.24.1+
**Status:** Production-ready
**Use Cases:** Multi-tenant SaaS, Kubernetes deployments, container orchestration, rolling updates

## Architecture

### Session State Components

Each persisted session contains:

1. **Session Metadata**
   - `sessionId`: Unique session identifier (UUID v4)
   - `createdAt`: ISO 8601 timestamp of session creation
   - `lastAccess`: ISO 8601 timestamp of last activity

2. **Instance Context**
   - `n8nApiUrl`: n8n instance API endpoint
   - `n8nApiKey`: n8n API authentication key (plaintext)
   - `instanceId`: Optional tenant/instance identifier
   - `sessionId`: Optional session-specific identifier
   - `metadata`: Optional custom application data

3. **Dormant Session Pattern**
   - Transport and MCP server objects are NOT persisted
   - Recreated automatically on first request after restore
   - Reduces memory footprint during restore

## API Reference

### N8NMCPEngine.exportSessionState()

Exports all active session state for persistence before shutdown.

```typescript
exportSessionState(): SessionState[]
```

**Returns:** Array of session state objects containing metadata and credentials

**Example:**
```typescript
const sessions = engine.exportSessionState();
// sessions = [
//   {
//     sessionId: '550e8400-e29b-41d4-a716-446655440000',
//     metadata: {
//       createdAt: '2025-11-24T10:30:00.000Z',
//       lastAccess: '2025-11-24T17:15:32.000Z'
//     },
//     context: {
//       n8nApiUrl: 'https://tenant1.n8n.cloud',
//       n8nApiKey: 'n8n_api_...',
//       instanceId: 'tenant-123',
//       metadata: { userId: 'user-456' }
//     }
//   }
// ]
```

**Key Behaviors:**
- Exports only non-expired sessions (within sessionTimeout)
- Detects and warns about duplicate session IDs
- Logs security event with session count
- Returns empty array if no active sessions

### N8NMCPEngine.restoreSessionState()

Restores sessions from previously exported state after container restart.

```typescript
restoreSessionState(sessions: SessionState[]): number
```

**Parameters:**
- `sessions`: Array of session state objects from `exportSessionState()`

**Returns:** Number of sessions successfully restored

**Example:**
```typescript
const sessions = await loadFromEncryptedStorage();
const count = engine.restoreSessionState(sessions);
console.log(`Restored ${count} sessions`);
```

**Key Behaviors:**
- Validates session metadata (timestamps, required fields)
- Skips expired sessions (age > sessionTimeout)
- Skips duplicate sessions (idempotent)
- Respects MAX_SESSIONS limit (default 100, configurable via N8N_MCP_MAX_SESSIONS env var)
- Recreates transports/servers lazily on first request
- Logs security events for restore success/failure

## Security Considerations

### Critical: Encrypt Before Storage

**The exported session state contains plaintext n8n API keys.** You MUST encrypt this data before persisting to disk.

```typescript
// ❌ NEVER DO THIS
await fs.writeFile('sessions.json', JSON.stringify(sessions));

// ✅ ALWAYS ENCRYPT
const encrypted = await encryptSessionData(sessions, encryptionKey);
await saveToSecureStorage(encrypted);
```

### Recommended Encryption Approach

```typescript
import crypto from 'crypto';

/**
 * Encrypt session data using AES-256-GCM
 */
async function encryptSessionData(
  sessions: SessionState[],
  encryptionKey: Buffer
): Promise<string> {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);

  const json = JSON.stringify(sessions);
  const encrypted = Buffer.concat([
    cipher.update(json, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  // Return base64: iv:authTag:encrypted
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join(':');
}

/**
 * Decrypt session data
 */
async function decryptSessionData(
  encryptedData: string,
  encryptionKey: Buffer
): Promise<SessionState[]> {
  const [ivB64, authTagB64, encryptedB64] = encryptedData.split(':');

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}
```

### Key Management

Store encryption keys securely:
- **Kubernetes:** Use Kubernetes Secrets with encryption at rest
- **AWS:** Use AWS Secrets Manager or Parameter Store with KMS
- **Azure:** Use Azure Key Vault
- **GCP:** Use Secret Manager
- **Local Dev:** Use environment variables (NEVER commit to git)

### Security Logging

All session persistence operations are logged with `[SECURITY]` prefix:

```
[SECURITY] session_export { timestamp, count }
[SECURITY] session_restore { timestamp, sessionId, instanceId }
[SECURITY] session_restore_failed { timestamp, sessionId, reason }
[SECURITY] max_sessions_reached { timestamp, count }
```

Monitor these logs in production for audit trails and security analysis.

## Implementation Examples

### 1. Express.js Multi-Tenant Backend

```typescript
import express from 'express';
import { N8NMCPEngine } from 'n8n-mcp';

const app = express();
const engine = new N8NMCPEngine({
  sessionTimeout: 1800000, // 30 minutes
  logLevel: 'info'
});

// Startup: Restore sessions from encrypted storage
async function startup() {
  try {
    const encrypted = await redis.get('mcp:sessions');
    if (encrypted) {
      const sessions = await decryptSessionData(
        encrypted,
        process.env.ENCRYPTION_KEY
      );
      const count = engine.restoreSessionState(sessions);
      console.log(`Restored ${count} sessions`);
    }
  } catch (error) {
    console.error('Failed to restore sessions:', error);
  }
}

// Shutdown: Export sessions to encrypted storage
async function shutdown() {
  try {
    const sessions = engine.exportSessionState();
    const encrypted = await encryptSessionData(
      sessions,
      process.env.ENCRYPTION_KEY
    );
    await redis.set('mcp:sessions', encrypted, 'EX', 3600); // 1 hour TTL
    console.log(`Exported ${sessions.length} sessions`);
  } catch (error) {
    console.error('Failed to export sessions:', error);
  }

  await engine.shutdown();
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
await startup();
app.listen(3000);
```

### 2. Kubernetes Deployment with Init Container

**deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: n8n-mcp
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  template:
    spec:
      initContainers:
      - name: restore-sessions
        image: your-app:latest
        command: ['/app/restore-sessions.sh']
        env:
        - name: ENCRYPTION_KEY
          valueFrom:
            secretKeyRef:
              name: mcp-secrets
              key: encryption-key
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: mcp-secrets
              key: redis-url
        volumeMounts:
        - name: sessions
          mountPath: /sessions

      containers:
      - name: mcp-server
        image: your-app:latest
        lifecycle:
          preStop:
            exec:
              command: ['/app/export-sessions.sh']
        env:
        - name: ENCRYPTION_KEY
          valueFrom:
            secretKeyRef:
              name: mcp-secrets
              key: encryption-key
        - name: SESSION_TIMEOUT
          value: "1800000"
        volumeMounts:
        - name: sessions
          mountPath: /sessions

        # Graceful shutdown configuration
        terminationGracePeriodSeconds: 30

      volumes:
      - name: sessions
        emptyDir: {}
```

**restore-sessions.sh:**
```bash
#!/bin/bash
set -e

echo "Restoring sessions from Redis..."

# Fetch encrypted sessions from Redis
ENCRYPTED=$(redis-cli -u "$REDIS_URL" GET "mcp:sessions:${HOSTNAME}")

if [ -n "$ENCRYPTED" ]; then
  echo "$ENCRYPTED" > /sessions/encrypted.txt
  echo "Sessions fetched, will be restored on startup"
else
  echo "No sessions to restore"
fi
```

**export-sessions.sh:**
```bash
#!/bin/bash
set -e

echo "Exporting sessions to Redis..."

# Trigger session export via HTTP endpoint
curl -X POST http://localhost:3000/internal/export-sessions

echo "Sessions exported successfully"
```

### 3. Docker Compose with Redis

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  n8n-mcp:
    build: .
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - REDIS_URL=redis://redis:6379
      - SESSION_TIMEOUT=1800000
    depends_on:
      - redis
    volumes:
      - ./data:/data
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
    stop_grace_period: 30s

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

volumes:
  redis-data:
```

**Application code:**
```typescript
import { N8NMCPEngine } from 'n8n-mcp';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const engine = new N8NMCPEngine();

// Export endpoint (called by preStop hook)
app.post('/internal/export-sessions', async (req, res) => {
  try {
    const sessions = engine.exportSessionState();
    const encrypted = await encryptSessionData(
      sessions,
      Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
    );

    // Store with hostname as key for per-container tracking
    await redis.set(
      `mcp:sessions:${os.hostname()}`,
      encrypted,
      'EX',
      3600
    );

    res.json({ exported: sessions.length });
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Restore on startup
async function startup() {
  const encrypted = await redis.get(`mcp:sessions:${os.hostname()}`);
  if (encrypted) {
    const sessions = await decryptSessionData(
      encrypted,
      Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
    );
    const count = engine.restoreSessionState(sessions);
    console.log(`Restored ${count} sessions`);
  }
}
```

## Best Practices

### 1. Session Timeout Configuration

Choose appropriate timeout based on use case:

```typescript
const engine = new N8NMCPEngine({
  sessionTimeout: 1800000  // 30 minutes (recommended default)
});

// Development: 5 minutes
sessionTimeout: 300000

// Production SaaS: 30-60 minutes
sessionTimeout: 1800000 - 3600000

// Long-running workflows: 2-4 hours
sessionTimeout: 7200000 - 14400000
```

### 2. Storage Backend Selection

**Redis (Recommended for Production)**
- Fast read/write for session data
- TTL support for automatic cleanup
- Pub/sub for distributed coordination
- Atomic operations for consistency

**Database (PostgreSQL/MySQL)**
- JSONB column for session state
- Good for audit requirements
- Slower than Redis
- Requires periodic cleanup

**S3/Cloud Storage**
- Good for disaster recovery backups
- Not suitable for hot session restore
- High latency
- Good for long-term session archival

### 3. Monitoring and Alerting

Monitor these metrics:

```typescript
// Session export metrics
const sessions = engine.exportSessionState();
metrics.gauge('mcp.sessions.exported', sessions.length);
metrics.gauge('mcp.sessions.export_size_kb',
  JSON.stringify(sessions).length / 1024
);

// Session restore metrics
const restored = engine.restoreSessionState(sessions);
metrics.gauge('mcp.sessions.restored', restored);
metrics.gauge('mcp.sessions.restore_success_rate',
  restored / sessions.length
);

// Runtime metrics
const info = engine.getSessionInfo();
metrics.gauge('mcp.sessions.active', info.active ? 1 : 0);
metrics.gauge('mcp.sessions.age_seconds', info.age || 0);
```

Alert on:
- Export failures (should be rare)
- Low restore success rate (<95%)
- MAX_SESSIONS limit reached
- High session age (potential leaks)

### 4. Graceful Shutdown Timing

Ensure sufficient time for session export:

```typescript
// Kubernetes terminationGracePeriodSeconds
terminationGracePeriodSeconds: 30  // 30 seconds minimum

// Docker stop timeout
docker run --stop-timeout 30 your-image

// Process signal handling
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, starting graceful shutdown...');

  // 1. Stop accepting new requests (5s)
  await server.close();

  // 2. Wait for in-flight requests (10s)
  await waitForInFlightRequests(10000);

  // 3. Export sessions (5s)
  const sessions = engine.exportSessionState();
  await saveEncryptedSessions(sessions);

  // 4. Cleanup (5s)
  await engine.shutdown();

  // 5. Exit (5s buffer)
  process.exit(0);
});
```

### 5. Idempotency Handling

Sessions can be restored multiple times safely:

```typescript
// First restore
const count1 = engine.restoreSessionState(sessions);
// count1 = 5

// Second restore (same sessions)
const count2 = engine.restoreSessionState(sessions);
// count2 = 0 (all already exist)
```

This is safe for:
- Init container retries
- Manual recovery operations
- Disaster recovery scenarios

### 6. Multi-Instance Coordination

For multiple container instances:

```typescript
// Option 1: Per-instance storage (simple)
const key = `mcp:sessions:${instance.hostname}`;

// Option 2: Centralized with distributed lock (advanced)
const lock = await acquireLock('mcp:session-export');
try {
  const allSessions = await getAllInstanceSessions();
  await saveToBackup(allSessions);
} finally {
  await lock.release();
}
```

## Performance Considerations

### Memory Usage

```typescript
// Each session: ~1-2 KB in memory
// 100 sessions: ~100-200 KB
// 1000 sessions: ~1-2 MB

// Export serialized size
const sessions = engine.exportSessionState();
const sizeKB = JSON.stringify(sessions).length / 1024;
console.log(`Export size: ${sizeKB.toFixed(2)} KB`);
```

### Export/Restore Speed

```typescript
// Export: O(n) where n = active sessions
// Typical: 50-100 sessions in <10ms

// Restore: O(n) with validation
// Typical: 50-100 sessions in 20-50ms

// Factor in encryption:
// AES-256-GCM: ~1ms per 100 sessions
```

### MAX_SESSIONS Limit

Default limit: 100 sessions per container (configurable via `N8N_MCP_MAX_SESSIONS` env var)

```typescript
// Restore respects limit
const sessions = createSessions(150); // 150 sessions
const restored = engine.restoreSessionState(sessions);
// restored = 100 (only first 100 restored, or N8N_MCP_MAX_SESSIONS value)
```

For higher session limits:
- Set `N8N_MCP_MAX_SESSIONS=1000` (or desired limit)
- Monitor memory usage as sessions consume resources
- Alternatively, deploy multiple containers with session routing/sharding

## Troubleshooting

### Issue: No sessions restored

**Symptoms:**
```
Restored 0 sessions
```

**Causes:**
1. All sessions expired (age > sessionTimeout)
2. Invalid date format in metadata
3. Missing required context fields

**Debug:**
```typescript
const sessions = await loadFromEncryptedStorage();
console.log('Loaded sessions:', sessions.length);

// Check individual sessions
sessions.forEach((s, i) => {
  const age = Date.now() - new Date(s.metadata.lastAccess).getTime();
  console.log(`Session ${i}: age=${age}ms, expired=${age > sessionTimeout}`);
});
```

### Issue: Restore fails with "invalid context"

**Symptoms:**
```
[SECURITY] session_restore_failed { sessionId: '...', reason: 'invalid context: ...' }
```

**Causes:**
1. Missing n8nApiUrl or n8nApiKey
2. Invalid URL format
3. Corrupted session data

**Fix:**
```typescript
// Validate before restore
const valid = sessions.filter(s => {
  if (!s.context?.n8nApiUrl || !s.context?.n8nApiKey) {
    console.warn(`Invalid session ${s.sessionId}: missing credentials`);
    return false;
  }
  try {
    new URL(s.context.n8nApiUrl); // Validate URL
    return true;
  } catch {
    console.warn(`Invalid session ${s.sessionId}: malformed URL`);
    return false;
  }
});

const count = engine.restoreSessionState(valid);
```

### Issue: MAX_SESSIONS limit hit

**Symptoms:**
```
Reached MAX_SESSIONS limit (100), skipping remaining sessions
```

**Solutions:**

1. Increase limit: Set `N8N_MCP_MAX_SESSIONS=1000` (or desired value)
2. Scale horizontally (more containers)
3. Implement session sharding
4. Reduce sessionTimeout
5. Clean up inactive sessions

```typescript
// Pre-filter by activity
const recentSessions = sessions.filter(s => {
  const age = Date.now() - new Date(s.metadata.lastAccess).getTime();
  return age < 600000; // Only restore sessions active in last 10 min
});

const count = engine.restoreSessionState(recentSessions);
```

### Issue: Duplicate session IDs

**Symptoms:**
```
Duplicate sessionId detected during export: 550e8400-...
```

**Cause:** Bug in session management logic

**Fix:** This is a warning, not an error. The duplicate is automatically skipped. If persistent, investigate session creation logic.

### Issue: High memory usage after restore

**Symptoms:** Container OOM after restoring many sessions

**Cause:** Too many sessions for container resources

**Solution:**
```typescript
// Restore in batches
async function restoreInBatches(sessions: SessionState[], batchSize = 25) {
  let totalRestored = 0;

  for (let i = 0; i < sessions.length; i += batchSize) {
    const batch = sessions.slice(i, i + batchSize);
    const count = engine.restoreSessionState(batch);
    totalRestored += count;

    // Wait for GC between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return totalRestored;
}
```

## Version Compatibility

| Feature | Version | Status |
|---------|---------|--------|
| exportSessionState() | 2.3.0+ | Stable |
| restoreSessionState() | 2.3.0+ | Stable |
| Security logging | 2.24.1+ | Stable |
| Duplicate detection | 2.24.1+ | Stable |
| Race condition fix | 2.24.1+ | Stable |
| Date validation | 2.24.1+ | Stable |
| Optional instanceId | 2.24.1+ | Stable |

## Additional Resources

- [HTTP Deployment Guide](./HTTP_DEPLOYMENT.md) - Multi-tenant HTTP server setup
- [Library Usage Guide](./LIBRARY_USAGE.md) - Embedding n8n-mcp in your app
- [Docker Guide](./DOCKER_README.md) - Container deployment
- [Flexible Instance Configuration](./FLEXIBLE_INSTANCE_CONFIGURATION.md) - Multi-tenant patterns

## Support

For issues or questions:
- GitHub Issues: https://github.com/czlonkowski/n8n-mcp/issues
- Documentation: https://github.com/czlonkowski/n8n-mcp#readme

---

Conceived by Romuald Członkowski - https://www.aiadvisors.pl/en
