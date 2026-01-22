# Claude Code Setup

Connect n8n-MCP to Claude Code CLI for enhanced n8n workflow development from the command line.

## Quick Setup via CLI

### Basic configuration (documentation tools only)

**For Linux, macOS, or Windows (WSL/Git Bash):**
```bash
claude mcp add n8n-mcp \
  -e MCP_MODE=stdio \
  -e LOG_LEVEL=error \
  -e DISABLE_CONSOLE_OUTPUT=true \
  -- npx n8n-mcp
```

**For native Windows PowerShell:**
```powershell
# Note: The backtick ` is PowerShell's line continuation character.
claude mcp add n8n-mcp `
  '-e MCP_MODE=stdio' `
  '-e LOG_LEVEL=error' `
  '-e DISABLE_CONSOLE_OUTPUT=true' `
  -- npx n8n-mcp
```

![Adding n8n-MCP server in Claude Code](./img/cc_command.png)

### Full configuration (with n8n management tools)

**For Linux, macOS, or Windows (WSL/Git Bash):**
```bash
claude mcp add n8n-mcp \
  -e MCP_MODE=stdio \
  -e LOG_LEVEL=error \
  -e DISABLE_CONSOLE_OUTPUT=true \
  -e N8N_API_URL=https://your-n8n-instance.com \
  -e N8N_API_KEY=your-api-key \
  -- npx n8n-mcp
```

**For native Windows PowerShell:**
```powershell
# Note: The backtick ` is PowerShell's line continuation character.
claude mcp add n8n-mcp `
  '-e MCP_MODE=stdio' `
  '-e LOG_LEVEL=error' `
  '-e DISABLE_CONSOLE_OUTPUT=true' `
  '-e N8N_API_URL=https://your-n8n-instance.com' `
  '-e N8N_API_KEY=your-api-key' `
  -- npx n8n-mcp
```

Make sure to replace `https://your-n8n-instance.com` with your actual n8n URL and `your-api-key` with your n8n API key.

## Alternative Setup Methods

### Option 1: Import from Claude Desktop

If you already have n8n-MCP configured in Claude Desktop:
```bash
claude mcp add-from-claude-desktop
```

### Option 2: Project Configuration

For team sharing, add to `.mcp.json` in your project root:
```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "npx",
      "args": ["n8n-mcp"],
      "env": {
        "MCP_MODE": "stdio",
        "LOG_LEVEL": "error",
        "DISABLE_CONSOLE_OUTPUT": "true",
        "N8N_API_URL": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key"
      }
    }
  }
}
```

Then use with scope flag:
```bash
claude mcp add n8n-mcp --scope project
```

## Managing Your MCP Server

Check server status:
```bash
claude mcp list
claude mcp get n8n-mcp
```

During a conversation, use the `/mcp` command to see server status and available tools.

![n8n-MCP connected and showing 39 tools available](./img/cc_connected.png)

Remove the server:
```bash
claude mcp remove n8n-mcp
```

## 🎓 Add Claude Skills (Optional)

Supercharge your n8n workflow building with specialized Claude Code skills! The [n8n-skills](https://github.com/czlonkowski/n8n-skills) repository provides 7 complementary skills that teach AI assistants how to build production-ready n8n workflows.

### What You Get

- ✅ **n8n Expression Syntax** - Correct {{}} patterns and common mistakes
- ✅ **n8n MCP Tools Expert** - How to use n8n-mcp tools effectively
- ✅ **n8n Workflow Patterns** - 5 proven architectural patterns
- ✅ **n8n Validation Expert** - Interpret and fix validation errors
- ✅ **n8n Node Configuration** - Operation-aware setup guidance
- ✅ **n8n Code JavaScript** - Write effective JavaScript in Code nodes
- ✅ **n8n Code Python** - Python patterns with limitation awareness

### Installation

**Method 1: Plugin Installation** (Recommended)
```bash
/plugin install czlonkowski/n8n-skills
```

**Method 2: Via Marketplace**
```bash
# Add as marketplace, then browse and install
/plugin marketplace add czlonkowski/n8n-skills

# Then browse available plugins
/plugin install
# Select "n8n-mcp-skills" from the list
```

**Method 3: Manual Installation**
```bash
# 1. Clone the repository
git clone https://github.com/czlonkowski/n8n-skills.git

# 2. Copy skills to your Claude Code skills directory
cp -r n8n-skills/skills/* ~/.claude/skills/

# 3. Reload Claude Code
# Skills will activate automatically
```

For complete installation instructions, configuration options, and usage examples, see the [n8n-skills README](https://github.com/czlonkowski/n8n-skills#-installation).

Skills work seamlessly with n8n-mcp to provide expert guidance throughout the workflow building process!

## Project Instructions

For optimal results, create a `CLAUDE.md` file in your project root with the instructions from the [main README's Claude Project Setup section](../README.md#-claude-project-setup).

## Tips

- If you're running n8n locally, use `http://localhost:5678` as the `N8N_API_URL`.
- The n8n API credentials are optional. Without them, you'll only have access to documentation and validation tools. With credentials, you get full workflow management capabilities.
- **Scope Management:**
    - By default, `claude mcp add` uses `--scope local` (also called "user scope"), which saves the configuration to your global user settings and keeps API keys private.
    - To share the configuration with your team, use `--scope project`. This saves the configuration to a `.mcp.json` file in your project's root directory.
- **Switching Scope:** The cleanest method is to `remove` the server and then `add` it back with the desired scope flag (e.g., `claude mcp remove n8n-mcp` followed by `claude mcp add n8n-mcp --scope project`).
- **Manual Switching (Advanced):** You can manually edit your `.claude.json` file (e.g., `C:\Users\YourName\.claude.json`). To switch, cut the `"n8n-mcp": { ... }` block from the top-level `"mcpServers"` object (user scope) and paste it into the nested `"mcpServers"` object under your project's path key (project scope), or vice versa. **Important:** You may need to restart Claude Code for manual changes to take effect.
- Claude Code will automatically start the MCP server when you begin a conversation.
