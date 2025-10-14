import { Database } from "bun:sqlite";
import type { Server } from "bun";

// Initialize SQLite database
const db = new Database("branch.db");

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_id INTEGER UNIQUE NOT NULL,
    username TEXT NOT NULL,
    avatar_url TEXT,
    access_token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_scan DATETIME
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS tech_stack (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    technology TEXT NOT NULL,
    category TEXT NOT NULL,
    repo_count INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, technology)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS ai_assistance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    repo_name TEXT NOT NULL,
    ai_tool TEXT NOT NULL,
    mention_count INTEGER NOT NULL,
    found_in TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, repo_name, ai_tool)
  )
`);

console.log("✅ Database initialized");

// Server configuration
const PORT = process.env.PORT || 3000;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";

// Main server
const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0", // Listen on all interfaces for Railway
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Serve static files
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const file = Bun.file("./public/index.html");
      return new Response(file);
    }

    if (url.pathname === "/dashboard.html") {
      const file = Bun.file("./public/dashboard.html");
      return new Response(file);
    }

    if (url.pathname.startsWith("/styles.css")) {
      const file = Bun.file("./public/styles.css");
      return new Response(file, {
        headers: { "Content-Type": "text/css" }
      });
    }

    // API Routes
    if (url.pathname === "/api/auth/github") {
      // Redirect to GitHub OAuth
      const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=read:user,repo`;
      return Response.redirect(githubAuthUrl);
    }

    if (url.pathname === "/api/auth/callback") {
      // Handle GitHub OAuth callback
      const code = url.searchParams.get("code");

      if (!code) {
        return new Response("Missing code parameter", { status: 400 });
      }

      try {
        // Exchange code for access token
        const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code
          })
        });

        const tokenData = await tokenResponse.json() as { access_token: string };
        const accessToken = tokenData.access_token;

        // Get user info
        const userResponse = await fetch("https://api.github.com/user", {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Accept": "application/vnd.github.v3+json"
          }
        });

        const userData = await userResponse.json() as {
          id: number;
          login: string;
          avatar_url: string;
        };

        // Store or update user in database
        const stmt = db.prepare(`
          INSERT INTO users (github_id, username, avatar_url, access_token)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(github_id) DO UPDATE SET
            access_token = excluded.access_token,
            avatar_url = excluded.avatar_url
        `);

        stmt.run(userData.id, userData.login, userData.avatar_url, accessToken);

        // Redirect to dashboard with user ID
        return Response.redirect(`/dashboard.html?user=${userData.login}`);

      } catch (error) {
        console.error("OAuth error:", error);
        return new Response("Authentication failed", { status: 500 });
      }
    }

    if (url.pathname === "/api/scan") {
      // Scan user's repositories
      const username = url.searchParams.get("username");

      if (!username) {
        return new Response(JSON.stringify({ error: "Missing username" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        // Get user from database
        const userStmt = db.prepare("SELECT * FROM users WHERE username = ?");
        const user = userStmt.get(username) as any;

        if (!user) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Fetch all repos
        const reposResponse = await fetch(
          `https://api.github.com/users/${username}/repos?per_page=100`,
          {
            headers: {
              "Authorization": `Bearer ${user.access_token}`,
              "Accept": "application/vnd.github.v3+json"
            }
          }
        );

        const repos = await reposResponse.json() as Array<{
          name: string;
          language: string | null;
          topics: string[];
          default_branch: string;
        }>;

        // Analyze tech stack
        const techCount = new Map<string, { category: string; count: number }>();

        repos.forEach(repo => {
          // Count languages
          if (repo.language) {
            const key = repo.language;
            const existing = techCount.get(key);
            techCount.set(key, {
              category: "language",
              count: existing ? existing.count + 1 : 1
            });
          }

          // Count topics (frameworks/tools)
          repo.topics?.forEach(topic => {
            const existing = techCount.get(topic);
            techCount.set(topic, {
              category: "framework",
              count: existing ? existing.count + 1 : 1
            });
          });
        });

        // Clear old tech stack and insert new
        db.run("DELETE FROM tech_stack WHERE user_id = ?", [user.id]);

        const insertStmt = db.prepare(`
          INSERT INTO tech_stack (user_id, technology, category, repo_count)
          VALUES (?, ?, ?, ?)
        `);

        for (const [tech, data] of techCount.entries()) {
          insertStmt.run(user.id, tech, data.category, data.count);
        }

        // Scan for AI assistance mentions
        const aiTools = {
          "Claude Code": /claude[- ]code/gi,
          "Claude": /\bclaude\b/gi,
          "ChatGPT": /chatgpt|chat[- ]gpt/gi,
          "GitHub Copilot": /copilot/gi,
          "Cursor": /cursor ai|cursor\.ai/gi,
          "AI Assisted": /ai[- ]assisted|ai[- ]generated|with ai|using ai/gi
        };

        // Clear old AI assistance data
        db.run("DELETE FROM ai_assistance WHERE user_id = ?", [user.id]);

        const aiInsertStmt = db.prepare(`
          INSERT INTO ai_assistance (user_id, repo_name, ai_tool, mention_count, found_in)
          VALUES (?, ?, ?, ?, ?)
        `);

        // Scan each repo's README
        for (const repo of repos) {
          try {
            // Try to fetch README
            const readmeResponse = await fetch(
              `https://api.github.com/repos/${username}/${repo.name}/readme`,
              {
                headers: {
                  "Authorization": `Bearer ${user.access_token}`,
                  "Accept": "application/vnd.github.v3+json"
                }
              }
            );

            if (readmeResponse.ok) {
              const readmeData = await readmeResponse.json() as { content: string; encoding: string };
              const readmeContent = Buffer.from(readmeData.content, 'base64').toString('utf-8').toLowerCase();

              // Check for each AI tool
              for (const [toolName, pattern] of Object.entries(aiTools)) {
                const matches = readmeContent.match(pattern);
                if (matches && matches.length > 0) {
                  aiInsertStmt.run(user.id, repo.name, toolName, matches.length, "README");
                }
              }
            }
          } catch (error) {
            // Skip repos without README or with access issues
            continue;
          }
        }

        // Update last scan time
        db.run("UPDATE users SET last_scan = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);

        return new Response(JSON.stringify({
          success: true,
          repos_analyzed: repos.length,
          technologies_found: techCount.size
        }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (error) {
        console.error("Scan error:", error);
        return new Response(JSON.stringify({ error: "Scan failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/api/techstack") {
      // Get tech stack for user
      const username = url.searchParams.get("username");

      if (!username) {
        return new Response(JSON.stringify({ error: "Missing username" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const stmt = db.prepare(`
        SELECT t.technology, t.category, t.repo_count, u.username, u.avatar_url, u.last_scan
        FROM tech_stack t
        JOIN users u ON t.user_id = u.id
        WHERE u.username = ?
        ORDER BY t.repo_count DESC
      `);

      const results = stmt.all(username) as any[];

      if (results.length === 0) {
        return new Response(JSON.stringify({ error: "No data found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Get AI assistance data
      const aiStmt = db.prepare(`
        SELECT ai_tool, COUNT(DISTINCT repo_name) as repo_count, SUM(mention_count) as total_mentions
        FROM ai_assistance
        WHERE user_id = (SELECT id FROM users WHERE username = ?)
        GROUP BY ai_tool
        ORDER BY repo_count DESC, total_mentions DESC
      `);

      const aiResults = aiStmt.all(username) as any[];

      return new Response(JSON.stringify({
        username: results[0].username,
        avatar_url: results[0].avatar_url,
        last_scan: results[0].last_scan,
        tech_stack: results.map(r => ({
          technology: r.technology,
          category: r.category,
          repo_count: r.repo_count
        })),
        ai_assistance: aiResults.map(r => ({
          tool: r.ai_tool,
          repo_count: r.repo_count,
          mentions: r.total_mentions
        }))
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
});

console.log(`🚀 Branch server running on port ${PORT}`);
