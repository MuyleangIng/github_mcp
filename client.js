// ============================================================
//  GITHUB MCP CLIENT — Tests all 8 tools against REAL GitHub
// ============================================================

const { Client } = require("@modelcontextprotocol/sdk/client");
const { StdioClientTransport } = require("./node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js");

// ── Colors
const R = "\x1b[0m", B = "\x1b[1m", G = "\x1b[32m", BL = "\x1b[34m";
const C = "\x1b[36m", Y = "\x1b[33m", D = "\x1b[2m", RED = "\x1b[31m", M = "\x1b[35m";

const banner = (t) => console.log(`\n${BL}${"═".repeat(62)}${R}\n${B}${BL}  ${t}${R}\n${BL}${"═".repeat(62)}${R}\n`);
const step = (n, t) => console.log(`${B}${G}[Step ${n}]${R} ${t}`);
const label = (t) => console.log(`\n  ${C}▸ ${t}${R}`);
const ok = (t) => console.log(`  ${G}✅ ${t}${R}`);
const fail = (t) => console.log(`  ${RED}❌ ${t}${R}`);
const info = (t) => console.log(`  ${D}${t}${R}`);
const sep = () => console.log(`\n${D}${"─".repeat(62)}${R}\n`);

function show(data, maxLines = 15) {
  const lines = JSON.stringify(data, null, 2).split("\n");
  lines.slice(0, maxLines).forEach(l => console.log(`    ${D}${l}${R}`));
  if (lines.length > maxLines) console.log(`    ${D}... (${lines.length - maxLines} more lines)${R}`);
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content[0].text;
  if (result.isError) return { error: true, data: text };
  try { return { error: false, data: JSON.parse(text) }; }
  catch { return { error: false, data: text }; }
}

// ══════════════════════════════════════════════════════════════

async function main() {
  banner("GitHub MCP — Live Integration Test");
  console.log(`${D}Connecting to real GitHub API through MCP protocol${R}`);
  console.log(`${D}This tests the exact same flow Claude Desktop uses!${R}\n`);

  if (!process.env.GITHUB_TOKEN) {
    console.log(`${RED}${B}ERROR: No GitHub token provided!${R}\n`);
    console.log(`Run with your token like this:`);
    console.log(`  ${C}GITHUB_TOKEN=ghp_yourtoken node client.js${R}\n`);
    console.log(`Get a token at: https://github.com/settings/tokens`);
    process.exit(1);
  }

  let passed = 0, failed = 0;
  let username = "";

  // ── Step 1: Connect
  step(1, "Connecting to GitHub MCP Server...");
  const transport = new StdioClientTransport({
    command: "node",
    args: ["server.js"],
    cwd: __dirname,
    env: { ...process.env, GITHUB_TOKEN: process.env.GITHUB_TOKEN }
  });
  const client = new Client({ name: "github-test-client", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  ok("Connected to GitHub MCP Server!");
  passed++;

  sep();

  // ── Step 2: Discover
  step(2, "Discovering available tools...");
  const { tools } = await client.listTools();
  console.log(`\n  ${Y}Found ${tools.length} GitHub tools:${R}`);
  tools.forEach(t => console.log(`    ${B}•${R} ${t.name} — ${D}${t.description}${R}`));
  if (tools.length === 8) { ok("All 8 tools available"); passed++; }
  else { fail(`Expected 8 tools, got ${tools.length}`); failed++; }

  const { resources } = await client.listResources();
  console.log(`\n  ${Y}Found ${resources.length} resources:${R}`);
  resources.forEach(r => console.log(`    ${B}•${R} ${r.name} ${D}(${r.uri})${R}`));
  passed++;

  sep();

  // ── Step 3: Get your profile
  step(3, "Getting your GitHub profile...");
  label("Tool: get_user");
  let r = await callTool(client, "get_user");
  if (!r.error && r.data.login) {
    username = r.data.login;
    ok(`Authenticated as: ${B}${r.data.login}${R} (${r.data.name || "no name set"})`);
    info(`Public repos: ${r.data.publicRepos} | Followers: ${r.data.followers} | Following: ${r.data.following}`);
    info(`Profile: ${r.data.profileUrl}`);
    passed++;
  } else {
    fail(`Auth failed: ${r.data}`);
    console.log(`\n${RED}Cannot continue without valid authentication.${R}`);
    console.log(`Check your token and try again.`);
    await client.close();
    process.exit(1);
  }

  sep();

  // ── Step 4: List your repos
  step(4, "Listing your repositories...");
  label("Tool: list_repos (your recent repos)");
  r = await callTool(client, "list_repos", { limit: 5, sort: "updated" });
  if (!r.error && Array.isArray(r.data)) {
    ok(`Found ${r.data.length} repos:`);
    r.data.forEach(repo => {
      const star = repo.stars > 0 ? ` ⭐${repo.stars}` : "";
      const lang = repo.language ? ` [${repo.language}]` : "";
      const priv = repo.isPrivate ? " 🔒" : "";
      console.log(`    ${B}•${R} ${repo.name}${priv}${lang}${star}`);
      if (repo.description) console.log(`      ${D}${repo.description}${R}`);
    });
    passed++;
  } else { fail(`Could not list repos: ${r.data}`); failed++; }

  // Save first repo for later tests
  let testOwner = username;
  let testRepo = "";
  if (!r.error && r.data.length > 0) {
    testRepo = r.data[0].name;
    testOwner = r.data[0].fullName.split("/")[0];
  }

  sep();

  // ── Step 5: Search repos on GitHub
  step(5, "Searching GitHub repositories...");
  label("Tool: search_repos (query: 'mcp server')");
  r = await callTool(client, "search_repos", { query: "mcp server", limit: 3 });
  if (!r.error && r.data.repos) {
    ok(`Found ${r.data.totalCount.toLocaleString()} total results. Top 3:`);
    r.data.repos.forEach(repo => {
      console.log(`    ${B}•${R} ${repo.fullName} ⭐${repo.stars} [${repo.language || "?"}]`);
      if (repo.description) console.log(`      ${D}${repo.description?.substring(0, 80)}${R}`);
    });
    passed++;
  } else { fail(`Search failed: ${r.data}`); failed++; }

  sep();

  // ── Step 6: Get repo details
  if (testRepo) {
    step(6, `Getting details for ${testOwner}/${testRepo}...`);
    label(`Tool: get_repo (${testOwner}/${testRepo})`);
    r = await callTool(client, "get_repo", { owner: testOwner, repo: testRepo });
    if (!r.error && r.data.fullName) {
      ok(`Repo: ${r.data.fullName}`);
      info(`Language: ${r.data.language || "N/A"} | Stars: ${r.data.stars} | Forks: ${r.data.forks}`);
      info(`Open issues: ${r.data.openIssues} | Default branch: ${r.data.defaultBranch}`);
      if (r.data.topics?.length > 0) info(`Topics: ${r.data.topics.join(", ")}`);
      passed++;
    } else { fail(`Could not get repo: ${r.data}`); failed++; }
  } else {
    step(6, "Skipping repo details (no repos found)");
    info("You need at least 1 repo for this test");
  }

  sep();

  // ── Step 7: List issues
  if (testRepo) {
    step(7, `Checking issues on ${testOwner}/${testRepo}...`);
    label("Tool: list_issues (state: all, limit: 5)");
    r = await callTool(client, "list_issues", { owner: testOwner, repo: testRepo, state: "all", limit: 5 });
    if (!r.error) {
      if (r.data.length > 0) {
        ok(`Found ${r.data.length} issues:`);
        r.data.forEach(i => {
          const state = i.state === "open" ? `${G}open${R}` : `${RED}closed${R}`;
          console.log(`    ${B}#${i.number}${R} ${i.title} [${state}]`);
        });
      } else {
        ok("No issues found (repo has no issues — that's fine!)");
      }
      passed++;
    } else { fail(`Could not list issues: ${r.data}`); failed++; }
  }

  sep();

  // ── Step 8: List pull requests
  if (testRepo) {
    step(8, `Checking pull requests on ${testOwner}/${testRepo}...`);
    label("Tool: list_pull_requests (state: all, limit: 5)");
    r = await callTool(client, "list_pull_requests", { owner: testOwner, repo: testRepo, state: "all", limit: 5 });
    if (!r.error) {
      if (r.data.length > 0) {
        ok(`Found ${r.data.length} PRs:`);
        r.data.forEach(p => {
          const state = p.state === "open" ? `${G}open${R}` : `${M}merged/closed${R}`;
          console.log(`    ${B}#${p.number}${R} ${p.title} [${state}] by ${p.author}`);
        });
      } else {
        ok("No pull requests found (that's fine!)");
      }
      passed++;
    } else { fail(`Could not list PRs: ${r.data}`); failed++; }
  }

  sep();

  // ── Step 9: Read file contents
  if (testRepo) {
    step(9, `Reading README from ${testOwner}/${testRepo}...`);
    label("Tool: get_file_contents (path: README.md)");
    r = await callTool(client, "get_file_contents", { owner: testOwner, repo: testRepo, path: "README.md" });
    if (!r.error && r.data.content) {
      const preview = r.data.content.substring(0, 200).replace(/\n/g, " ");
      ok(`Got README.md (${r.data.size} bytes)`);
      info(`Preview: ${preview}...`);
      passed++;
    } else {
      // Try root directory listing instead
      label("No README found, listing root directory...");
      r = await callTool(client, "get_file_contents", { owner: testOwner, repo: testRepo, path: "" });
      if (!r.error && Array.isArray(r.data)) {
        ok(`Root directory has ${r.data.length} items:`);
        r.data.slice(0, 8).forEach(f => console.log(`    ${f.type === "dir" ? "📁" : "📄"} ${f.name}`));
        passed++;
      } else { fail(`Could not read files: ${r.data}`); failed++; }
    }
  }

  sep();

  // ── Step 10: List commits
  if (testRepo) {
    step(10, `Listing recent commits on ${testOwner}/${testRepo}...`);
    label("Tool: list_commits (limit: 5)");
    r = await callTool(client, "list_commits", { owner: testOwner, repo: testRepo, limit: 5 });
    if (!r.error && Array.isArray(r.data)) {
      ok(`Found ${r.data.length} recent commits:`);
      r.data.forEach(c => {
        console.log(`    ${Y}${c.sha}${R} ${c.message} ${D}— ${c.author}${R}`);
      });
      passed++;
    } else { fail(`Could not list commits: ${r.data}`); failed++; }
  }

  sep();

  // ── Step 11: Read resources
  step(11, "Reading MCP resources...");
  for (const res of resources) {
    label(`Resource: ${res.name} (${res.uri})`);
    try {
      const response = await client.readResource({ uri: res.uri });
      const content = JSON.parse(response.contents[0].text);
      ok(`Got data`);
      show(content, 6);
      passed++;
    } catch (e) {
      fail(`Could not read: ${e.message}`);
      failed++;
    }
  }

  sep();

  // ══════════════════════════════════════════════════════════
  banner("TEST RESULTS");

  const total = passed + failed;
  const pct = Math.round((passed / total) * 100);

  console.log(`  ${B}GitHub User:${R}   @${username}`);
  console.log(`  ${B}Test Repo:${R}     ${testOwner}/${testRepo || "(none)"}`);
  console.log();
  console.log(`  ${B}Total tests:${R}   ${total}`);
  console.log(`  ${G}Passed:${R}        ${passed}`);
  console.log(`  ${failed > 0 ? RED : G}Failed:${R}        ${failed}`);
  console.log(`  ${B}Score:${R}         ${pct}%\n`);

  if (failed === 0) {
    console.log(`  ${B}${G}🎉 ALL TESTS PASSED!${R}\n`);
    console.log(`  ${D}Your GitHub MCP server is working perfectly.`);
    console.log(`  To use this with Claude Desktop, add to your config:`);
    console.log();
    console.log(`  ${C}"github": {`);
    console.log(`    "command": "node",`);
    console.log(`    "args": ["${__dirname}/server.js"],`);
    console.log(`    "env": { "GITHUB_TOKEN": "your-token" }`);
    console.log(`  }${R}\n`);
  } else {
    console.log(`  ${Y}Some tests had issues — check the output above.${R}\n`);
  }

  await client.close();
  process.exit(0);
}

main().catch(err => { console.error("Client error:", err); process.exit(1); });
