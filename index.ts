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
    location TEXT,
    github_location TEXT,
    scanned_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_scan DATETIME
  )
`);

// Add scanned_by column to existing tables (migration)
try {
  db.run(`ALTER TABLE users ADD COLUMN scanned_by TEXT`);
  console.log("✅ Added scanned_by column");
} catch (e) {
  // Column already exists, ignore error
}

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

db.run(`
  CREATE TABLE IF NOT EXISTS repositories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    language TEXT,
    stars INTEGER DEFAULT 0,
    url TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, name)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    service_name TEXT NOT NULL,
    repo_count INTEGER NOT NULL,
    mention_count INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, service_name)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS social_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    github_username TEXT NOT NULL,
    avatar_url TEXT,
    connection_type TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, github_username, connection_type)
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
          location?: string;
        };

        // Store or update user in database
        const stmt = db.prepare(`
          INSERT INTO users (github_id, username, avatar_url, access_token, github_location, location)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(github_id) DO UPDATE SET
            access_token = excluded.access_token,
            avatar_url = excluded.avatar_url,
            github_location = excluded.github_location,
            location = COALESCE(location, excluded.github_location)
        `);

        stmt.run(userData.id, userData.login, userData.avatar_url, accessToken, userData.location || null, userData.location || null);

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
      const scannerUsername = url.searchParams.get("scanner"); // Who is initiating the scan

      if (!username) {
        return new Response(JSON.stringify({ error: "Missing username" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        // Check if target user exists, if not create a placeholder
        let targetUser = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
        if (!targetUser) {
          // Fetch basic user info from GitHub (public API, no auth needed)
          const userInfoResponse = await fetch(`https://api.github.com/users/${username}`, {
            headers: {
              "Accept": "application/vnd.github.v3+json"
            }
          });

          if (!userInfoResponse.ok) {
            return new Response(JSON.stringify({ error: "GitHub user not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" }
            });
          }

          const userInfo = await userInfoResponse.json() as {
            id: number;
            login: string;
            avatar_url: string;
            location?: string;
          };

          // Create user record without their own access token, but track who scanned them
          const createStmt = db.prepare(`
            INSERT INTO users (github_id, username, avatar_url, github_location, location, scanned_by)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          createStmt.run(userInfo.id, userInfo.login, userInfo.avatar_url, userInfo.location || null, userInfo.location || null, scannerUsername || null);

          targetUser = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
        }

        const user = targetUser;

        // Fetch all repos (public API, no auth needed)
        const reposResponse = await fetch(
          `https://api.github.com/users/${username}/repos?per_page=100`,
          {
            headers: {
              "Accept": "application/vnd.github.v3+json"
            }
          }
        );

        const repos = await reposResponse.json() as Array<{
          name: string;
          description: string | null;
          language: string | null;
          topics: string[];
          default_branch: string;
          stargazers_count: number;
          html_url: string;
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

        // Clear old repositories data
        db.run("DELETE FROM repositories WHERE user_id = ?", [user.id]);

        const repoInsertStmt = db.prepare(`
          INSERT INTO repositories (user_id, name, description, language, stars, url)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        // Save all repos
        for (const repo of repos) {
          repoInsertStmt.run(
            user.id,
            repo.name,
            repo.description || null,
            repo.language || null,
            repo.stargazers_count,
            repo.html_url
          );
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

        // Services to detect
        const services = {
          "Railway": /railway\.app|railway\.com|\brailway\b/gi,
          "Cloudflare": /cloudflare|workers\.dev|pages\.dev/gi,
          "Vercel": /vercel\.app|vercel\.com|\bvercel\b/gi,
          "Netlify": /netlify\.app|netlify\.com|\bnetlify\b/gi,
          "AWS": /amazonaws\.com|aws\.amazon|\baws\b/gi,
          "Google Cloud": /cloud\.google|gcp|google cloud/gi,
          "Heroku": /heroku\.com|heroku\.app|\bheroku\b/gi,
          "DigitalOcean": /digitalocean\.com|\bdigitalocean\b/gi,
          "Render": /render\.com|\brender\b/gi,
          "Fly.io": /fly\.io|\bfly\.io\b/gi,
          "Supabase": /supabase\.co|supabase\.com|\bsupabase\b/gi,
          "Firebase": /firebase\.com|firebase\.google|\bfirebase\b/gi,
          "PlanetScale": /planetscale\.com|\bplanetscale\b/gi,
          "Neon": /neon\.tech|\bneon\b/gi
        };

        // Clear old AI assistance and services data
        db.run("DELETE FROM ai_assistance WHERE user_id = ?", [user.id]);
        db.run("DELETE FROM services WHERE user_id = ?", [user.id]);

        const aiInsertStmt = db.prepare(`
          INSERT INTO ai_assistance (user_id, repo_name, ai_tool, mention_count, found_in)
          VALUES (?, ?, ?, ?, ?)
        `);

        const serviceCountMap = new Map<string, { repos: Set<string>; mentions: number }>();

        // Scan each repo's README
        for (const repo of repos) {
          try {
            // Try to fetch README (public API, no auth needed)
            const readmeResponse = await fetch(
              `https://api.github.com/repos/${username}/${repo.name}/readme`,
              {
                headers: {
                  "Accept": "application/vnd.github.v3+json"
                }
              }
            );

            if (readmeResponse.ok) {
              const readmeData = await readmeResponse.json() as { content: string; encoding: string };
              const readmeContent = Buffer.from(readmeData.content, 'base64').toString('utf-8');
              const readmeContentLower = readmeContent.toLowerCase();

              // Check for each AI tool
              for (const [toolName, pattern] of Object.entries(aiTools)) {
                const matches = readmeContentLower.match(pattern);
                if (matches && matches.length > 0) {
                  aiInsertStmt.run(user.id, repo.name, toolName, matches.length, "README");
                }
              }

              // Check for each service
              for (const [serviceName, pattern] of Object.entries(services)) {
                const matches = readmeContentLower.match(pattern);
                if (matches && matches.length > 0) {
                  const existing = serviceCountMap.get(serviceName);
                  if (existing) {
                    existing.repos.add(repo.name);
                    existing.mentions += matches.length;
                  } else {
                    serviceCountMap.set(serviceName, {
                      repos: new Set([repo.name]),
                      mentions: matches.length
                    });
                  }
                }
              }
            }
          } catch (error) {
            // Skip repos without README or with access issues
            continue;
          }
        }

        // Insert services data
        const servicesInsertStmt = db.prepare(`
          INSERT INTO services (user_id, service_name, repo_count, mention_count)
          VALUES (?, ?, ?, ?)
        `);

        for (const [serviceName, data] of serviceCountMap.entries()) {
          servicesInsertStmt.run(user.id, serviceName, data.repos.size, data.mentions);
        }

        // Fetch followers and following
        try {
          // Clear old social connections
          db.run("DELETE FROM social_connections WHERE user_id = ?", [user.id]);

          const socialInsertStmt = db.prepare(`
            INSERT INTO social_connections (user_id, github_username, avatar_url, connection_type)
            VALUES (?, ?, ?, ?)
          `);

          // Fetch followers (limit to 100, public API, no auth needed)
          const followersResponse = await fetch(
            `https://api.github.com/users/${username}/followers?per_page=100`,
            {
              headers: {
                "Accept": "application/vnd.github.v3+json"
              }
            }
          );

          if (followersResponse.ok) {
            const followers = await followersResponse.json() as Array<{ login: string; avatar_url: string }>;
            for (const follower of followers) {
              socialInsertStmt.run(user.id, follower.login, follower.avatar_url, "follower");
            }
          }

          // Fetch following (limit to 100, public API, no auth needed)
          const followingResponse = await fetch(
            `https://api.github.com/users/${username}/following?per_page=100`,
            {
              headers: {
                "Accept": "application/vnd.github.v3+json"
              }
            }
          );

          if (followingResponse.ok) {
            const following = await followingResponse.json() as Array<{ login: string; avatar_url: string }>;
            for (const person of following) {
              socialInsertStmt.run(user.id, person.login, person.avatar_url, "following");
            }
          }
        } catch (error) {
          console.error("Error fetching social connections:", error);
          // Continue even if social connections fail
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

      // Get user info
      const userStmt = db.prepare(`
        SELECT username, avatar_url, last_scan, location, access_token, scanned_by
        FROM users
        WHERE username = ?
      `);

      const userData = userStmt.get(username) as any;

      if (!userData) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Determine user type based on authentication status
      let userType = 'unscanned';
      if (userData.access_token) {
        userType = 'authenticated'; // Green glow - user logged in themselves
      } else if (userData.scanned_by) {
        userType = 'scanned'; // Yellow glow - scanned by someone else
      }

      // Get tech stack
      const techStmt = db.prepare(`
        SELECT t.technology, t.category, t.repo_count
        FROM tech_stack t
        JOIN users u ON t.user_id = u.id
        WHERE u.username = ?
        ORDER BY t.repo_count DESC
      `);

      const techResults = techStmt.all(username) as any[];

      // Get AI assistance data
      const aiStmt = db.prepare(`
        SELECT ai_tool, COUNT(DISTINCT repo_name) as repo_count, SUM(mention_count) as total_mentions
        FROM ai_assistance
        WHERE user_id = (SELECT id FROM users WHERE username = ?)
        GROUP BY ai_tool
        ORDER BY repo_count DESC, total_mentions DESC
      `);

      const aiResults = aiStmt.all(username) as any[];

      // Get services data
      const servicesStmt = db.prepare(`
        SELECT service_name, repo_count, mention_count
        FROM services
        WHERE user_id = (SELECT id FROM users WHERE username = ?)
        ORDER BY repo_count DESC, mention_count DESC
      `);

      const servicesResults = servicesStmt.all(username) as any[];

      // Get repositories
      const reposStmt = db.prepare(`
        SELECT name, description, language, stars, url
        FROM repositories
        WHERE user_id = (SELECT id FROM users WHERE username = ?)
        ORDER BY stars DESC, name ASC
      `);

      const reposResults = reposStmt.all(username) as any[];

      // Get followers
      const followersStmt = db.prepare(`
        SELECT github_username, avatar_url
        FROM social_connections
        WHERE user_id = (SELECT id FROM users WHERE username = ?)
          AND connection_type = 'follower'
        ORDER BY github_username ASC
      `);

      const followersResults = followersStmt.all(username) as any[];

      // Get following
      const followingStmt = db.prepare(`
        SELECT github_username, avatar_url
        FROM social_connections
        WHERE user_id = (SELECT id FROM users WHERE username = ?)
          AND connection_type = 'following'
        ORDER BY github_username ASC
      `);

      const followingResults = followingStmt.all(username) as any[];

      return new Response(JSON.stringify({
        username: userData.username,
        avatar_url: userData.avatar_url,
        location: userData.location,
        last_scan: userData.last_scan,
        user_type: userType,
        scanned_by: userData.scanned_by,
        followers: followersResults.map((f: any) => ({
          username: f.github_username,
          avatar_url: f.avatar_url
        })),
        following: followingResults.map((f: any) => ({
          username: f.github_username,
          avatar_url: f.avatar_url
        })),
        repositories: reposResults.map((r: any) => ({
          name: r.name,
          description: r.description,
          language: r.language,
          stars: r.stars,
          url: r.url
        })),
        tech_stack: techResults.map(r => ({
          technology: r.technology,
          category: r.category,
          repo_count: r.repo_count
        })),
        ai_assistance: aiResults.map(r => ({
          tool: r.ai_tool,
          repo_count: r.repo_count,
          mentions: r.total_mentions
        })),
        services: servicesResults.map(r => ({
          service: r.service_name,
          repo_count: r.repo_count,
          mentions: r.mention_count
        }))
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/api/update-location" && req.method === "POST") {
      try {
        const body = await req.json() as { username: string; location: string };
        const { username, location } = body;

        if (!username || location === undefined) {
          return new Response(JSON.stringify({ error: "Missing username or location" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const stmt = db.prepare(`
          UPDATE users
          SET location = ?
          WHERE username = ?
        `);

        stmt.run(location, username);

        return new Response(JSON.stringify({ success: true, location }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Update location error:", error);
        return new Response(JSON.stringify({ error: "Failed to update location" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  }
});

console.log(`🚀 Branch server running on port ${PORT}`);
