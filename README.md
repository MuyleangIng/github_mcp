# GitHub MCP Server — Live Test

A working MCP server that connects to the **real GitHub API**.
This is the same pattern Claude Desktop uses to access your GitHub.

## Quick Start (3 commands)

```bash
# 1. Install
npm install

# 2. Run with your token
GITHUB_TOKEN=ghp_yourtoken node client.js

# Windows (PowerShell):
$env:GITHUB_TOKEN="ghp_yourtoken"; node client.js

# Windows (CMD):
set GITHUB_TOKEN=ghp_yourtoken && node client.js
```

## What Gets Tested

The client runs **12+ tests** across these real GitHub operations:

| Step | Tool | What It Does |
|------|------|-------------|
| 1 | (connect) | MCP handshake with server |
| 2 | (discover) | Find all 8 tools + 2 resources |
| 3 | `get_user` | Get YOUR GitHub profile |
| 4 | `list_repos` | List your recent repos |
| 5 | `search_repos` | Search GitHub for "mcp server" |
| 6 | `get_repo` | Get details on your first repo |
| 7 | `list_issues` | Check issues on your repo |
| 8 | `list_pull_requests` | Check PRs on your repo |
| 9 | `get_file_contents` | Read README.md from your repo |
| 10 | `list_commits` | Show recent commits |
| 11 | (resources) | Read profile + repos resources |

## Get a GitHub Token

1. Go to https://github.com/settings/tokens
2. Click **"Generate new token (classic)"**
3. Name it "MCP Test"
4. Select scopes: `repo`, `read:org`, `read:user`
5. Click Generate → Copy the `ghp_...` token

## Use with Claude Desktop

After testing, add this to your Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "github": {
      "command": "node",
      "args": ["/full/path/to/mcp-github-demo/server.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_yourtoken"
      }
    }
  }
}
```

Then restart Claude Desktop. You'll see the hammer icon 🔨.
Try asking: "Show me my recent GitHub repos" or "What are the open issues on my project?"

## How It Works

```
You ask Claude: "What are my open issues?"
         │
         ▼
┌──────────────────┐
│ Claude Desktop   │  ← Host (contains MCP client)
│ sees "github"    │
│ tools available  │
│ calls list_issues│
└────────┬─────────┘
         │ MCP protocol (JSON-RPC over stdio)
         ▼
┌──────────────────┐
│ server.js        │  ← MCP Server (this file!)
│ receives request │
│ calls GitHub API │
└────────┬─────────┘
         │ HTTPS
         ▼
┌──────────────────┐
│ api.github.com   │  ← External Data Source
│ returns issues   │
└──────────────────┘
         │
         ▼
   Data flows back: GitHub → server.js → Claude → You
```
