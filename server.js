// ============================================================
//  GITHUB MCP SERVER
//  Connects to the REAL GitHub API and exposes it as MCP tools
//  
//  This is what the official @modelcontextprotocol/server-github
//  does — we're building a simplified version so you can see
//  exactly how it works inside.
// ============================================================

const { Server } = require("@modelcontextprotocol/sdk/server");
const { StdioServerTransport } = require("./node_modules/@modelcontextprotocol/sdk/dist/cjs/server/stdio.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} = require("./node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js");

const https = require("https");

// ── Get token from environment variable
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error("ERROR: Set GITHUB_TOKEN environment variable");
  process.exit(1);
}

// ── GitHub API helper
function githubAPI(endpoint) {
  return new Promise((resolve, reject) => {
    const url = endpoint.startsWith("http") ? new URL(endpoint) : new URL(`https://api.github.com${endpoint}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "MCP-GitHub-Demo/1.0"
      }
    };
    https.get(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    }).on("error", reject);
  });
}

const server = new Server(
  { name: "github-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

// ══════════════════════════════════════════════════════════════
//  8 TOOLS — Real GitHub operations
// ══════════════════════════════════════════════════════════════

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_user",
      description: "Get the authenticated GitHub user's profile info",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "list_repos",
      description: "List repositories for the authenticated user or a specified user",
      inputSchema: {
        type: "object",
        properties: {
          username: { type: "string", description: "GitHub username (leave empty for your own repos)" },
          sort: { type: "string", enum: ["updated", "created", "pushed", "full_name"], description: "Sort by (default: updated)" },
          limit: { type: "number", description: "Max repos to return (default: 10)" }
        }
      }
    },
    {
      name: "get_repo",
      description: "Get detailed info about a specific repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repo owner (username or org)" },
          repo: { type: "string", description: "Repository name" }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "list_issues",
      description: "List issues for a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          state: { type: "string", enum: ["open", "closed", "all"], description: "Filter by state (default: open)" },
          limit: { type: "number", description: "Max issues to return (default: 10)" }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "list_pull_requests",
      description: "List pull requests for a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          state: { type: "string", enum: ["open", "closed", "all"], description: "Filter by state (default: open)" },
          limit: { type: "number", description: "Max PRs to return (default: 10)" }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "get_file_contents",
      description: "Get the contents of a file from a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          path: { type: "string", description: "File path (e.g. 'README.md', 'src/index.js')" },
          branch: { type: "string", description: "Branch name (default: main)" }
        },
        required: ["owner", "repo", "path"]
      }
    },
    {
      name: "search_repos",
      description: "Search GitHub repositories by keyword",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (default: 5)" }
        },
        required: ["query"]
      }
    },
    {
      name: "list_commits",
      description: "List recent commits for a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          limit: { type: "number", description: "Max commits (default: 10)" }
        },
        required: ["owner", "repo"]
      }
    }
  ]
}));

// ── Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const json = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
  const err = (msg) => ({ content: [{ type: "text", text: `Error: ${msg}` }], isError: true });

  try {
    switch (name) {
      case "get_user": {
        const user = await githubAPI("/user");
        if (user.message) return err(user.message);
        return json({
          login: user.login,
          name: user.name,
          bio: user.bio,
          publicRepos: user.public_repos,
          followers: user.followers,
          following: user.following,
          createdAt: user.created_at,
          avatarUrl: user.avatar_url,
          profileUrl: user.html_url
        });
      }

      case "list_repos": {
        const limit = args?.limit || 10;
        const sort = args?.sort || "updated";
        const endpoint = args?.username
          ? `/users/${args.username}/repos?sort=${sort}&per_page=${limit}`
          : `/user/repos?sort=${sort}&per_page=${limit}&type=owner`;
        const repos = await githubAPI(endpoint);
        if (repos.message) return err(repos.message);
        return json(repos.map(r => ({
          name: r.name,
          fullName: r.full_name,
          description: r.description,
          language: r.language,
          stars: r.stargazers_count,
          forks: r.forks_count,
          isPrivate: r.private,
          updatedAt: r.updated_at,
          url: r.html_url
        })));
      }

      case "get_repo": {
        const repo = await githubAPI(`/repos/${args.owner}/${args.repo}`);
        if (repo.message) return err(repo.message);
        return json({
          fullName: repo.full_name,
          description: repo.description,
          language: repo.language,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          openIssues: repo.open_issues_count,
          isPrivate: repo.private,
          defaultBranch: repo.default_branch,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at,
          topics: repo.topics,
          license: repo.license?.name,
          url: repo.html_url
        });
      }

      case "list_issues": {
        const state = args?.state || "open";
        const limit = args?.limit || 10;
        const issues = await githubAPI(`/repos/${args.owner}/${args.repo}/issues?state=${state}&per_page=${limit}`);
        if (issues.message) return err(issues.message);
        return json(issues.filter(i => !i.pull_request).map(i => ({
          number: i.number,
          title: i.title,
          state: i.state,
          author: i.user.login,
          labels: i.labels.map(l => l.name),
          createdAt: i.created_at,
          comments: i.comments,
          url: i.html_url
        })));
      }

      case "list_pull_requests": {
        const state = args?.state || "open";
        const limit = args?.limit || 10;
        const prs = await githubAPI(`/repos/${args.owner}/${args.repo}/pulls?state=${state}&per_page=${limit}`);
        if (prs.message) return err(prs.message);
        return json(prs.map(p => ({
          number: p.number,
          title: p.title,
          state: p.state,
          author: p.user.login,
          branch: p.head.ref,
          baseBranch: p.base.ref,
          createdAt: p.created_at,
          url: p.html_url
        })));
      }

      case "get_file_contents": {
        const branch = args?.branch || "";
        const ref = branch ? `?ref=${branch}` : "";
        const file = await githubAPI(`/repos/${args.owner}/${args.repo}/contents/${args.path}${ref}`);
        if (file.message) return err(file.message);
        if (file.content) {
          const decoded = Buffer.from(file.content, "base64").toString("utf-8");
          return json({ path: file.path, size: file.size, content: decoded });
        }
        // Directory listing
        if (Array.isArray(file)) {
          return json(file.map(f => ({ name: f.name, type: f.type, size: f.size, path: f.path })));
        }
        return err("Could not read file");
      }

      case "search_repos": {
        const limit = args?.limit || 5;
        const result = await githubAPI(`/search/repositories?q=${encodeURIComponent(args.query)}&per_page=${limit}`);
        if (result.message) return err(result.message);
        return json({
          totalCount: result.total_count,
          repos: result.items.map(r => ({
            fullName: r.full_name,
            description: r.description,
            language: r.language,
            stars: r.stargazers_count,
            url: r.html_url
          }))
        });
      }

      case "list_commits": {
        const limit = args?.limit || 10;
        const commits = await githubAPI(`/repos/${args.owner}/${args.repo}/commits?per_page=${limit}`);
        if (commits.message) return err(commits.message);
        return json(commits.map(c => ({
          sha: c.sha.substring(0, 7),
          message: c.commit.message.split("\n")[0],
          author: c.commit.author.name,
          date: c.commit.author.date,
          url: c.html_url
        })));
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err(e.message);
  }
});

// ══════════════════════════════════════════════════════════════
//  RESOURCES
// ══════════════════════════════════════════════════════════════

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: "github://user/profile", name: "GitHub Profile", description: "Your GitHub profile", mimeType: "application/json" },
    { uri: "github://user/repos", name: "Your Repositories", description: "Your recent repos", mimeType: "application/json" }
  ]
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const wrap = (d) => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify(d, null, 2) }] });

  if (uri === "github://user/profile") {
    const user = await githubAPI("/user");
    return wrap({ login: user.login, name: user.name, publicRepos: user.public_repos, followers: user.followers });
  }
  if (uri === "github://user/repos") {
    const repos = await githubAPI("/user/repos?sort=updated&per_page=5&type=owner");
    return wrap(repos.map(r => ({ name: r.name, language: r.language, stars: r.stargazers_count })));
  }
  throw new Error(`Unknown resource: ${uri}`);
});

// ── START
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub MCP Server running");
}
main().catch(err => { console.error(err); process.exit(1); });
