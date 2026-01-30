# n8n-mcp Multi-Tenant: Local Setup Handoff

## Prerequisites

- Docker and Docker Compose installed
- Git

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/czlonkowski/n8n-mcp.git
cd n8n-mcp
```

### 2. Create environment file

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
ENABLE_MULTI_TENANT=true
AUTH_TOKEN=<generate-your-own-token>
MCP_MODE=http
PORT=3000
```

Generate a secure token:

```bash
openssl rand -base64 32
```

### 3. Start with Docker Compose

```bash
docker compose up -d
```

Verify it's running:

```bash
curl http://localhost:3000/health
```

## Port Configuration

The default port inside the container is **3000**. You can map it to any port on your host machine by editing `docker-compose.yml`:

```yaml
ports:
  - "127.0.0.1:<YOUR_PORT>:3000"
```

Examples:

| Use case | Port mapping | Access URL |
|---|---|---|
| Default | `127.0.0.1:3000:3000` | `http://localhost:3000` |
| Custom port | `127.0.0.1:8080:3000` | `http://localhost:8080` |
| Open to network | `0.0.0.0:3000:3000` | `http://<your-ip>:3000` |

Port 3011 is specific to the production server -- you do not need to use it.

## Running Without Docker Compose

```bash
docker run -d -p 3000:3000 \
  --name n8n-mcp-server \
  -e ENABLE_MULTI_TENANT=true \
  -e MCP_MODE=http \
  -e AUTH_TOKEN=your-secure-token \
  ghcr.io/czlonkowski/n8n-mcp:latest
```

## Running From Source (Development)

Requires Node.js >= 16.

```bash
npm install
npm run build
npm run rebuild    # Build the node database
npm run start:http # Start in HTTP mode
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `ENABLE_MULTI_TENANT` | Yes | `true` | Enable multi-tenant mode |
| `AUTH_TOKEN` | Yes (HTTP) | - | Server authentication token |
| `MCP_MODE` | No | `http` | `http`, `stdio`, or `sse` |
| `PORT` | No | `3000` | Internal container port |
| `RATE_LIMIT_PER_MINUTE` | No | `50` | Rate limit per API key |
| `DAILY_LIMIT` | No | `100` | Daily request limit per API key |
| `LOG_LEVEL` | No | `info` | `error`, `warn`, `info`, `debug` |

## Connecting from n8n

When making requests, pass your n8n credentials via headers:

- `x-n8n-url`: Your n8n instance URL (e.g., `https://my-n8n.example.com`)
- `x-n8n-key`: Your n8n API key

## Health Check

```bash
curl http://localhost:3000/health
```

## Troubleshooting

- **Container exits immediately**: Run `docker logs n8n-mcp-server` to see errors. Most common cause: missing `AUTH_TOKEN`.
- **Database not found**: The entrypoint script auto-initializes the database on first run. Check logs if this fails.
- **Permission errors**: The container runs as a non-root user. If mounting volumes, ensure the directory is writable.

## Architecture Notes

- The container uses a two-stage Docker build (builder + runtime) for a minimal image size.
- The SQLite database (`data/nodes.db`) is pre-built and included in the image.
- In multi-tenant mode, each user identifies their n8n instance via request headers -- no server-side n8n credentials are stored.

---

Conceived by Romuald Czlonkowski - [www.aiadvisors.pl/en](https://www.aiadvisors.pl/en)
