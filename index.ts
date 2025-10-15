import { Database } from "bun:sqlite";
import type { Server } from "bun";

// Initialize SQLite database
// Use /data/branch.db in production (Railway volume), branch.db in dev
const dbPath = process.env.RAILWAY_ENVIRONMENT ? "/data/branch.db" : "branch.db";
const db = new Database(dbPath);
console.log(`📦 Database path: ${dbPath}`);

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

// Add total_repos column (migration)
try {
  db.run(`ALTER TABLE users ADD COLUMN total_repos INTEGER DEFAULT 0`);
  console.log("✅ Added total_repos column");
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
    is_fork BOOLEAN DEFAULT 0,
    fork_parent_owner TEXT,
    fork_parent_repo TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, name)
  )
`);

// Add fork columns to existing repositories table (migration)
try {
  db.run(`ALTER TABLE repositories ADD COLUMN is_fork BOOLEAN DEFAULT 0`);
  db.run(`ALTER TABLE repositories ADD COLUMN fork_parent_owner TEXT`);
  db.run(`ALTER TABLE repositories ADD COLUMN fork_parent_repo TEXT`);
  console.log("✅ Added fork columns to repositories");
} catch (e) {
  // Columns already exist, ignore error
}

db.run(`
  CREATE TABLE IF NOT EXISTS forks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_owner TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    forker_username TEXT NOT NULL,
    forker_user_id INTEGER,
    forked_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (forker_user_id) REFERENCES users(id),
    UNIQUE(repo_owner, repo_name, forker_username)
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

db.run(`
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tagged_by_user_id INTEGER NOT NULL,
    tagged_entity_type TEXT NOT NULL,
    tagged_entity_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tagged_by_user_id) REFERENCES users(id),
    UNIQUE(tagged_by_user_id, tagged_entity_type, tagged_entity_id, tag)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS contributors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_owner TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    contributor_username TEXT NOT NULL,
    contributor_user_id INTEGER,
    contributions INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contributor_user_id) REFERENCES users(id),
    UNIQUE(repo_owner, repo_name, contributor_username)
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
      // Only request read access to public user profile - no repo access needed
      const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=read:user`;
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
        // Get the scanner's access token for authenticated API calls
        let accessToken = null;
        if (scannerUsername) {
          const scannerStmt = db.prepare("SELECT access_token FROM users WHERE username = ?");
          const scanner = scannerStmt.get(scannerUsername) as any;
          if (scanner && scanner.access_token) {
            accessToken = scanner.access_token;
          }
        }

        // If no scanner token, try to get target user's token (for self-scan)
        if (!accessToken) {
          const userStmt = db.prepare("SELECT access_token FROM users WHERE username = ?");
          const user = userStmt.get(username) as any;
          if (user && user.access_token) {
            accessToken = user.access_token;
          }
        }

        // Require authentication for scanning
        if (!accessToken) {
          return new Response(JSON.stringify({
            error: "Authentication required. Please log in to scan profiles.",
            message: "Login with GitHub to get 5000 API requests per hour instead of 60."
          }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Check if target user exists, if not create a placeholder
        let targetUser = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
        if (!targetUser) {
          // Fetch basic user info from GitHub using authenticated API
          const userInfoResponse = await fetch(`https://api.github.com/users/${username}`, {
            headers: {
              "Authorization": `Bearer ${accessToken}`,
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

        // First, get total repo count from user profile
        const userInfoResponse = await fetch(`https://api.github.com/users/${username}`, {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Accept": "application/vnd.github.v3+json"
          }
        });
        const userInfo = await userInfoResponse.json() as { public_repos: number };
        const totalRepoCount = userInfo.public_repos;

        // Fetch repos sorted by stars (most popular first), limit to 20 for faster scanning
        const reposResponse = await fetch(
          `https://api.github.com/users/${username}/repos?per_page=20&sort=updated&direction=desc`,
          {
            headers: {
              "Authorization": `Bearer ${accessToken}`,
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
          fork: boolean;
          parent?: {
            owner: { login: string };
            name: string;
          };
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

        // Update tech stack (preserve historical data, just update counts)
        const insertStmt = db.prepare(`
          INSERT INTO tech_stack (user_id, technology, category, repo_count)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, technology) DO UPDATE SET
            repo_count = excluded.repo_count,
            updated_at = CURRENT_TIMESTAMP
        `);

        for (const [tech, data] of techCount.entries()) {
          insertStmt.run(user.id, tech, data.category, data.count);
        }

        // Update repositories (preserve historical data, update existing)
        const repoInsertStmt = db.prepare(`
          INSERT INTO repositories (user_id, name, description, language, stars, url, is_fork, fork_parent_owner, fork_parent_repo)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, name) DO UPDATE SET
            description = excluded.description,
            language = excluded.language,
            stars = excluded.stars,
            url = excluded.url,
            is_fork = excluded.is_fork,
            fork_parent_owner = excluded.fork_parent_owner,
            fork_parent_repo = excluded.fork_parent_repo,
            updated_at = CURRENT_TIMESTAMP
        `);

        // Save all repos with fork information
        for (const repo of repos) {
          repoInsertStmt.run(
            user.id,
            repo.name,
            repo.description || null,
            repo.language || null,
            repo.stargazers_count,
            repo.html_url,
            repo.fork ? 1 : 0,
            repo.parent?.owner.login || null,
            repo.parent?.name || null
          );
        }

        // Track fork relationships in forks table (preserve historical data)
        const forkInsertStmt = db.prepare(`
          INSERT OR IGNORE INTO forks (repo_owner, repo_name, forker_username, forker_user_id)
          VALUES (?, ?, ?, ?)
        `);

        for (const repo of repos) {
          if (repo.fork && repo.parent) {
            forkInsertStmt.run(
              repo.parent.owner.login,
              repo.parent.name,
              username,
              user.id
            );
          }
        }

        // Update last scan time and total repos count EARLY to avoid timeout issues
        // The rest of the scan (contributors, READMEs, social) continues but user gets immediate feedback
        db.run("UPDATE users SET last_scan = CURRENT_TIMESTAMP, total_repos = ? WHERE id = ?", [totalRepoCount, user.id]);

        // Fetch contributors for each repository (limit to top 10 per repo to avoid API limits)
        const contributorInsertStmt = db.prepare(`
          INSERT INTO contributors (repo_owner, repo_name, contributor_username, contributions)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(repo_owner, repo_name, contributor_username) DO UPDATE SET
            contributions = excluded.contributions,
            updated_at = CURRENT_TIMESTAMP
        `);

        for (const repo of repos) {
          try {
            const contributorsResponse = await fetch(
              `https://api.github.com/repos/${username}/${repo.name}/contributors?per_page=10`,
              {
                headers: {
                  "Authorization": `Bearer ${accessToken}`,
                  "Accept": "application/vnd.github.v3+json"
                }
              }
            );

            if (contributorsResponse.ok) {
              const contributors = await contributorsResponse.json() as Array<{
                login: string;
                contributions: number;
              }>;

              for (const contributor of contributors) {
                // Only store contributors other than the repo owner
                if (contributor.login !== username) {
                  contributorInsertStmt.run(
                    username,
                    repo.name,
                    contributor.login,
                    contributor.contributions
                  );
                }
              }
            }
          } catch (error) {
            // Skip repos with contributor access issues
            continue;
          }
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

        // Update AI assistance data (preserve historical data)
        const aiInsertStmt = db.prepare(`
          INSERT INTO ai_assistance (user_id, repo_name, ai_tool, mention_count, found_in)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, repo_name, ai_tool) DO UPDATE SET
            mention_count = excluded.mention_count,
            updated_at = CURRENT_TIMESTAMP
        `);

        const serviceCountMap = new Map<string, { repos: Set<string>; mentions: number }>();

        // Scan each repo's README
        for (const repo of repos) {
          try {
            // Try to fetch README with authentication
            const readmeResponse = await fetch(
              `https://api.github.com/repos/${username}/${repo.name}/readme`,
              {
                headers: {
                  "Authorization": `Bearer ${accessToken}`,
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

        // Update services data (preserve historical data)
        const servicesInsertStmt = db.prepare(`
          INSERT INTO services (user_id, service_name, repo_count, mention_count)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, service_name) DO UPDATE SET
            repo_count = excluded.repo_count,
            mention_count = excluded.mention_count,
            updated_at = CURRENT_TIMESTAMP
        `);

        for (const [serviceName, data] of serviceCountMap.entries()) {
          servicesInsertStmt.run(user.id, serviceName, data.repos.size, data.mentions);
        }

        // Fetch followers and following (preserve historical data)
        try {
          const socialInsertStmt = db.prepare(`
            INSERT INTO social_connections (user_id, github_username, avatar_url, connection_type)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, github_username, connection_type) DO UPDATE SET
              avatar_url = excluded.avatar_url,
              updated_at = CURRENT_TIMESTAMP
          `);

          // Fetch followers (limit to 100) with authentication
          const followersResponse = await fetch(
            `https://api.github.com/users/${username}/followers?per_page=100`,
            {
              headers: {
                "Authorization": `Bearer ${accessToken}`,
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

          // Fetch following (limit to 100) with authentication
          const followingResponse = await fetch(
            `https://api.github.com/users/${username}/following?per_page=100`,
            {
              headers: {
                "Authorization": `Bearer ${accessToken}`,
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

        return new Response(JSON.stringify({
          success: true,
          repos_scanned: repos.length,
          total_repos: totalRepoCount,
          has_more_repos: totalRepoCount > repos.length,
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

    if (url.pathname === "/api/scan-more") {
      // Scan additional repositories (incremental scan without clearing existing data)
      const username = url.searchParams.get("username");
      const scannerUsername = url.searchParams.get("scanner");

      if (!username) {
        return new Response(JSON.stringify({ error: "Missing username" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        // Get the scanner's access token
        let accessToken = null;
        if (scannerUsername) {
          const scannerStmt = db.prepare("SELECT access_token FROM users WHERE username = ?");
          const scanner = scannerStmt.get(scannerUsername) as any;
          if (scanner && scanner.access_token) {
            accessToken = scanner.access_token;
          }
        }

        if (!accessToken) {
          const userStmt = db.prepare("SELECT access_token FROM users WHERE username = ?");
          const user = userStmt.get(username) as any;
          if (user && user.access_token) {
            accessToken = user.access_token;
          }
        }

        if (!accessToken) {
          return new Response(JSON.stringify({
            error: "Authentication required"
          }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Get user
        const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
        if (!user) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Get current repo count in database
        const currentRepoCount = db.prepare("SELECT COUNT(*) as count FROM repositories WHERE user_id = ?").get(user.id) as any;
        const alreadyScanned = currentRepoCount.count;

        // Fetch next batch of repos (page 2: repos 21-40)
        const page = Math.floor(alreadyScanned / 20) + 1;
        const reposResponse = await fetch(
          `https://api.github.com/users/${username}/repos?per_page=20&page=${page}&sort=updated&direction=desc`,
          {
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Accept": "application/vnd.github.v3+json"
            }
          }
        );

        const repos = await reposResponse.json() as Array<{
          name: string;
          description: string | null;
          language: string | null;
          topics: string[];
          stargazers_count: number;
          html_url: string;
          fork: boolean;
          parent?: {
            owner: { login: string };
            name: string;
          };
        }>;

        if (repos.length === 0) {
          return new Response(JSON.stringify({
            success: true,
            message: "No more repos to scan",
            repos_scanned: alreadyScanned,
            total_repos: user.total_repos
          }), {
            headers: { "Content-Type": "application/json" }
          });
        }

        // Insert new repos (using INSERT OR IGNORE to skip duplicates)
        const repoInsertStmt = db.prepare(`
          INSERT OR IGNORE INTO repositories (user_id, name, description, language, stars, url, is_fork, fork_parent_owner, fork_parent_repo)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const repo of repos) {
          repoInsertStmt.run(
            user.id,
            repo.name,
            repo.description || null,
            repo.language || null,
            repo.stargazers_count,
            repo.html_url,
            repo.fork ? 1 : 0,
            repo.parent?.owner.login || null,
            repo.parent?.name || null
          );
        }

        // Update fork relationships incrementally
        const forkInsertStmt = db.prepare(`
          INSERT OR IGNORE INTO forks (repo_owner, repo_name, forker_username, forker_user_id)
          VALUES (?, ?, ?, ?)
        `);

        for (const repo of repos) {
          if (repo.fork && repo.parent) {
            forkInsertStmt.run(
              repo.parent.owner.login,
              repo.parent.name,
              username,
              user.id
            );
          }
        }

        // Scan READMEs for new repos
        const aiTools = {
          "Claude Code": /claude[- ]code/gi,
          "Claude": /\bclaude\b/gi,
          "ChatGPT": /chatgpt|chat[- ]gpt/gi,
          "GitHub Copilot": /copilot/gi,
          "Cursor": /cursor ai|cursor\.ai/gi,
          "AI Assisted": /ai[- ]assisted|ai[- ]generated|with ai|using ai/gi
        };

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

        const aiInsertStmt = db.prepare(`
          INSERT OR IGNORE INTO ai_assistance (user_id, repo_name, ai_tool, mention_count, found_in)
          VALUES (?, ?, ?, ?, ?)
        `);

        const serviceCountMap = new Map<string, { repos: Set<string>; mentions: number }>();

        for (const repo of repos) {
          try {
            const readmeResponse = await fetch(
              `https://api.github.com/repos/${username}/${repo.name}/readme`,
              {
                headers: {
                  "Authorization": `Bearer ${accessToken}`,
                  "Accept": "application/vnd.github.v3+json"
                }
              }
            );

            if (readmeResponse.ok) {
              const readmeData = await readmeResponse.json() as { content: string; encoding: string };
              const readmeContent = Buffer.from(readmeData.content, 'base64').toString('utf-8');
              const readmeContentLower = readmeContent.toLowerCase();

              for (const [toolName, pattern] of Object.entries(aiTools)) {
                const matches = readmeContentLower.match(pattern);
                if (matches && matches.length > 0) {
                  aiInsertStmt.run(user.id, repo.name, toolName, matches.length, "README");
                }
              }

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
            continue;
          }
        }

        // Update tech stack counts (recalculate from all repos)
        const allRepos = db.prepare("SELECT * FROM repositories WHERE user_id = ?").all(user.id) as any[];
        const techCount = new Map<string, { category: string; count: number }>();

        allRepos.forEach((repo: any) => {
          if (repo.language) {
            const existing = techCount.get(repo.language);
            techCount.set(repo.language, {
              category: "language",
              count: existing ? existing.count + 1 : 1
            });
          }
        });

        // Update tech stack (preserve historical data)
        const techInsertStmt = db.prepare(`
          INSERT INTO tech_stack (user_id, technology, category, repo_count)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, technology) DO UPDATE SET
            repo_count = excluded.repo_count,
            updated_at = CURRENT_TIMESTAMP
        `);

        for (const [tech, data] of techCount.entries()) {
          techInsertStmt.run(user.id, tech, data.category, data.count);
        }

        // Update services (merge new data with existing)
        for (const [serviceName, data] of serviceCountMap.entries()) {
          db.prepare(`
            INSERT INTO services (user_id, service_name, repo_count, mention_count)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, service_name) DO UPDATE SET
              repo_count = repo_count + excluded.repo_count,
              mention_count = mention_count + excluded.mention_count
          `).run(user.id, serviceName, data.repos.size, data.mentions);
        }

        // Get updated repo count
        const updatedCount = db.prepare("SELECT COUNT(*) as count FROM repositories WHERE user_id = ?").get(user.id) as any;

        return new Response(JSON.stringify({
          success: true,
          repos_added: repos.length,
          repos_scanned: updatedCount.count,
          total_repos: user.total_repos,
          has_more_repos: user.total_repos > updatedCount.count
        }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (error) {
        console.error("Scan more error:", error);
        return new Response(JSON.stringify({ error: "Scan failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/api/scan-social") {
      // Rescan only followers and following (no repos)
      const username = url.searchParams.get("username");
      const scannerUsername = url.searchParams.get("scanner");

      if (!username) {
        return new Response(JSON.stringify({ error: "Missing username" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        // Get the scanner's access token
        let accessToken = null;
        if (scannerUsername) {
          const scannerStmt = db.prepare("SELECT access_token FROM users WHERE username = ?");
          const scanner = scannerStmt.get(scannerUsername) as any;
          if (scanner && scanner.access_token) {
            accessToken = scanner.access_token;
          }
        }

        if (!accessToken) {
          const userStmt = db.prepare("SELECT access_token FROM users WHERE username = ?");
          const user = userStmt.get(username) as any;
          if (user && user.access_token) {
            accessToken = user.access_token;
          }
        }

        if (!accessToken) {
          return new Response(JSON.stringify({
            error: "Authentication required"
          }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Get user
        const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
        if (!user) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Fetch followers and following (preserve historical data)
        const socialInsertStmt = db.prepare(`
          INSERT INTO social_connections (user_id, github_username, avatar_url, connection_type)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, github_username, connection_type) DO UPDATE SET
            avatar_url = excluded.avatar_url,
            updated_at = CURRENT_TIMESTAMP
        `);

        // Fetch followers (limit to 100) with authentication
        const followersResponse = await fetch(
          `https://api.github.com/users/${username}/followers?per_page=100`,
          {
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Accept": "application/vnd.github.v3+json"
            }
          }
        );

        let followersAdded = 0;
        if (followersResponse.ok) {
          const followers = await followersResponse.json() as Array<{ login: string; avatar_url: string }>;
          for (const follower of followers) {
            socialInsertStmt.run(user.id, follower.login, follower.avatar_url, "follower");
          }
          followersAdded = followers.length;
        }

        // Fetch following (limit to 100) with authentication
        const followingResponse = await fetch(
          `https://api.github.com/users/${username}/following?per_page=100`,
          {
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Accept": "application/vnd.github.v3+json"
            }
          }
        );

        let followingAdded = 0;
        if (followingResponse.ok) {
          const following = await followingResponse.json() as Array<{ login: string; avatar_url: string }>;
          for (const person of following) {
            socialInsertStmt.run(user.id, person.login, person.avatar_url, "following");
          }
          followingAdded = following.length;
        }

        // Get updated counts from database
        const followersCount = db.prepare("SELECT COUNT(*) as count FROM social_connections WHERE user_id = ? AND connection_type = 'follower'").get(user.id) as any;
        const followingCount = db.prepare("SELECT COUNT(*) as count FROM social_connections WHERE user_id = ? AND connection_type = 'following'").get(user.id) as any;

        return new Response(JSON.stringify({
          success: true,
          followers_scanned: followersAdded,
          following_scanned: followingAdded,
          total_followers: followersCount.count,
          total_following: followingCount.count
        }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (error) {
        console.error("Scan social error:", error);
        return new Response(JSON.stringify({ error: "Social scan failed" }), {
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
        SELECT username, avatar_url, last_scan, location, access_token, scanned_by, total_repos
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

      // Get followers with their user type
      const followersStmt = db.prepare(`
        SELECT
          sc.github_username,
          sc.avatar_url,
          CASE
            WHEN u.access_token IS NOT NULL THEN 'authenticated'
            WHEN u.scanned_by IS NOT NULL THEN 'scanned'
            ELSE 'unscanned'
          END as user_type
        FROM social_connections sc
        LEFT JOIN users u ON u.username = sc.github_username
        WHERE sc.user_id = (SELECT id FROM users WHERE username = ?)
          AND sc.connection_type = 'follower'
        ORDER BY sc.github_username ASC
      `);

      const followersResults = followersStmt.all(username) as any[];

      // Get following with their user type
      const followingStmt = db.prepare(`
        SELECT
          sc.github_username,
          sc.avatar_url,
          CASE
            WHEN u.access_token IS NOT NULL THEN 'authenticated'
            WHEN u.scanned_by IS NOT NULL THEN 'scanned'
            ELSE 'unscanned'
          END as user_type
        FROM social_connections sc
        LEFT JOIN users u ON u.username = sc.github_username
        WHERE sc.user_id = (SELECT id FROM users WHERE username = ?)
          AND sc.connection_type = 'following'
        ORDER BY sc.github_username ASC
      `);

      const followingResults = followingStmt.all(username) as any[];

      // Get fork connections - repos this user has forked from others in our system
      const forkConnectionsStmt = db.prepare(`
        SELECT DISTINCT
          f.repo_owner,
          f.repo_name,
          u.avatar_url as owner_avatar,
          CASE
            WHEN u.access_token IS NOT NULL THEN 'authenticated'
            WHEN u.scanned_by IS NOT NULL THEN 'scanned'
            ELSE 'unscanned'
          END as owner_user_type
        FROM forks f
        LEFT JOIN users u ON u.username = f.repo_owner
        WHERE f.forker_username = ?
        ORDER BY f.repo_owner ASC, f.repo_name ASC
      `);

      const forkConnections = forkConnectionsStmt.all(username) as any[];

      // Get users who have forked this user's repos
      const forkedByStmt = db.prepare(`
        SELECT DISTINCT
          f.forker_username,
          f.repo_name,
          u.avatar_url,
          CASE
            WHEN u.access_token IS NOT NULL THEN 'authenticated'
            WHEN u.scanned_by IS NOT NULL THEN 'scanned'
            ELSE 'unscanned'
          END as user_type
        FROM forks f
        LEFT JOIN users u ON u.username = f.forker_username
        WHERE f.repo_owner = ?
        ORDER BY f.forker_username ASC, f.repo_name ASC
      `);

      const forkedBy = forkedByStmt.all(username) as any[];

      // Get contributors to this user's repos
      const contributorsStmt = db.prepare(`
        SELECT DISTINCT
          c.contributor_username,
          c.repo_name,
          c.contributions,
          u.avatar_url,
          CASE
            WHEN u.access_token IS NOT NULL THEN 'authenticated'
            WHEN u.scanned_by IS NOT NULL THEN 'scanned'
            ELSE 'unscanned'
          END as user_type
        FROM contributors c
        LEFT JOIN users u ON u.username = c.contributor_username
        WHERE c.repo_owner = ?
        ORDER BY c.contributions DESC, c.contributor_username ASC
      `);

      const contributorsToRepos = contributorsStmt.all(username) as any[];

      // Get repos this user has contributed to (owned by others)
      const contributedToStmt = db.prepare(`
        SELECT DISTINCT
          c.repo_owner,
          c.repo_name,
          c.contributions,
          u.avatar_url as owner_avatar,
          CASE
            WHEN u.access_token IS NOT NULL THEN 'authenticated'
            WHEN u.scanned_by IS NOT NULL THEN 'scanned'
            ELSE 'unscanned'
          END as owner_user_type
        FROM contributors c
        LEFT JOIN users u ON u.username = c.repo_owner
        WHERE c.contributor_username = ?
        ORDER BY c.contributions DESC, c.repo_owner ASC, c.repo_name ASC
      `);

      const contributedTo = contributedToStmt.all(username) as any[];

      return new Response(JSON.stringify({
        username: userData.username,
        avatar_url: userData.avatar_url,
        location: userData.location,
        last_scan: userData.last_scan,
        user_type: userType,
        scanned_by: userData.scanned_by,
        total_repos: userData.total_repos || 0,
        repos_scanned: reposResults.length,
        has_more_repos: (userData.total_repos || 0) > reposResults.length,
        followers: followersResults.map((f: any) => ({
          username: f.github_username,
          avatar_url: f.avatar_url,
          user_type: f.user_type
        })),
        following: followingResults.map((f: any) => ({
          username: f.github_username,
          avatar_url: f.avatar_url,
          user_type: f.user_type
        })),
        fork_connections: forkConnections.map((f: any) => ({
          repo_owner: f.repo_owner,
          repo_name: f.repo_name,
          owner_avatar: f.owner_avatar,
          owner_user_type: f.owner_user_type
        })),
        forked_by: forkedBy.map((f: any) => ({
          username: f.forker_username,
          repo_name: f.repo_name,
          avatar_url: f.avatar_url,
          user_type: f.user_type
        })),
        contributors: contributorsToRepos.map((c: any) => ({
          username: c.contributor_username,
          repo_name: c.repo_name,
          contributions: c.contributions,
          avatar_url: c.avatar_url,
          user_type: c.user_type
        })),
        contributed_to: contributedTo.map((c: any) => ({
          repo_owner: c.repo_owner,
          repo_name: c.repo_name,
          contributions: c.contributions,
          owner_avatar: c.owner_avatar,
          owner_user_type: c.owner_user_type
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

    if (url.pathname === "/api/locations") {
      // Get all unique locations with user counts
      try {
        const stmt = db.prepare(`
          SELECT location, COUNT(*) as user_count
          FROM users
          WHERE location IS NOT NULL AND location != ''
          GROUP BY location
          ORDER BY user_count DESC, location ASC
        `);

        const locations = stmt.all() as any[];

        return new Response(JSON.stringify({
          locations: locations.map(l => ({
            name: l.location,
            user_count: l.user_count
          }))
        }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Locations query error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch locations" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/api/location") {
      // Get all users in a specific location
      const location = url.searchParams.get("loc");

      if (!location) {
        return new Response(JSON.stringify({ error: "Missing location parameter" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        const stmt = db.prepare(`
          SELECT
            username,
            avatar_url,
            CASE
              WHEN access_token IS NOT NULL THEN 'authenticated'
              WHEN scanned_by IS NOT NULL THEN 'scanned'
              ELSE 'unscanned'
            END as user_type
          FROM users
          WHERE location = ?
          ORDER BY username ASC
        `);

        const users = stmt.all(location) as any[];

        return new Response(JSON.stringify({
          location,
          users: users.map(u => ({
            username: u.username,
            avatar_url: u.avatar_url,
            user_type: u.user_type
          }))
        }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Location query error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch location data" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/api/tags") {
      // Get all tags for a user (with tagged_by info to show green vs grey)
      const username = url.searchParams.get("username");
      const viewerUsername = url.searchParams.get("viewer"); // Who's viewing (for relative coloring)

      if (!username) {
        return new Response(JSON.stringify({ error: "Missing username parameter" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        const stmt = db.prepare(`
          SELECT
            t.tag,
            t.tagged_by_user_id,
            u.username as tagged_by_username,
            COUNT(*) as tag_count
          FROM tags t
          JOIN users u ON t.tagged_by_user_id = u.id
          WHERE t.tagged_entity_type = 'user'
            AND t.tagged_entity_id = (SELECT id FROM users WHERE username = ?)
          GROUP BY t.tag, t.tagged_by_user_id, u.username
          ORDER BY t.tag ASC
        `);

        const tags = stmt.all(username) as any[];

        // Group tags by tag name, showing who added them
        const tagMap = new Map<string, any[]>();
        tags.forEach(t => {
          if (!tagMap.has(t.tag)) {
            tagMap.set(t.tag, []);
          }
          tagMap.get(t.tag)?.push({
            tagged_by_username: t.tagged_by_username,
            is_viewer: viewerUsername ? t.tagged_by_username === viewerUsername : false
          });
        });

        // Check if viewer has each tag on their own profile
        const viewerTagsSet = new Set<string>();
        if (viewerUsername && viewerUsername !== username) {
          const viewerTagsStmt = db.prepare(`
            SELECT DISTINCT tag
            FROM tags
            WHERE tagged_entity_type = 'user'
              AND tagged_entity_id = (SELECT id FROM users WHERE username = ?)
          `);
          const viewerTags = viewerTagsStmt.all(viewerUsername) as any[];
          viewerTags.forEach(vt => viewerTagsSet.add(vt.tag));
        }

        const result = Array.from(tagMap.entries()).map(([tag, taggedBy]) => ({
          tag,
          tagged_by: taggedBy,
          is_own_tag: taggedBy.some(t => t.tagged_by_username === username),
          is_on_viewer_profile: viewerTagsSet.has(tag)
        }));

        return new Response(JSON.stringify({
          username,
          tags: result
        }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Tags query error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch tags" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/api/add-tag" && req.method === "POST") {
      // Add a tag to a user
      try {
        const body = await req.json() as {
          tagged_username: string;
          tag: string;
          tagged_by_username: string;
        };

        const { tagged_username, tag, tagged_by_username } = body;

        if (!tagged_username || !tag || !tagged_by_username) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Get user IDs
        const taggedUser = db.prepare("SELECT id FROM users WHERE username = ?").get(tagged_username) as any;
        const taggedByUser = db.prepare("SELECT id FROM users WHERE username = ?").get(tagged_by_username) as any;

        if (!taggedUser || !taggedByUser) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Insert tag (UNIQUE constraint prevents duplicates)
        const stmt = db.prepare(`
          INSERT INTO tags (tagged_by_user_id, tagged_entity_type, tagged_entity_id, tag)
          VALUES (?, 'user', ?, ?)
          ON CONFLICT DO NOTHING
        `);

        stmt.run(taggedByUser.id, taggedUser.id, tag);

        return new Response(JSON.stringify({ success: true, tag }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Add tag error:", error);
        return new Response(JSON.stringify({ error: "Failed to add tag" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/api/remove-tag" && req.method === "POST") {
      // Remove a tag (only if the logged-in user added it)
      try {
        const body = await req.json() as {
          tagged_username: string;
          tag: string;
          logged_in_username: string;
        };

        const { tagged_username, tag, logged_in_username } = body;

        if (!tagged_username || !tag || !logged_in_username) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Get user IDs
        const taggedUser = db.prepare("SELECT id FROM users WHERE username = ?").get(tagged_username) as any;
        const loggedInUser = db.prepare("SELECT id FROM users WHERE username = ?").get(logged_in_username) as any;

        if (!taggedUser || !loggedInUser) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Only delete if the logged-in user created this tag
        const stmt = db.prepare(`
          DELETE FROM tags
          WHERE tagged_by_user_id = ?
            AND tagged_entity_type = 'user'
            AND tagged_entity_id = ?
            AND tag = ?
        `);

        const result = stmt.run(loggedInUser.id, taggedUser.id, tag);

        if (result.changes === 0) {
          return new Response(JSON.stringify({ error: "Tag not found or you don't have permission to remove it" }), {
            status: 403,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Remove tag error:", error);
        return new Response(JSON.stringify({ error: "Failed to remove tag" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/api/tag") {
      // Get all users and repos with a specific tag
      const tagName = url.searchParams.get("name");

      if (!tagName) {
        return new Response(JSON.stringify({ error: "Missing tag name parameter" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        // Get users with this tag
        const usersStmt = db.prepare(`
          SELECT DISTINCT
            u.username,
            u.avatar_url,
            CASE
              WHEN u.access_token IS NOT NULL THEN 'authenticated'
              WHEN u.scanned_by IS NOT NULL THEN 'scanned'
              ELSE 'unscanned'
            END as user_type,
            COUNT(DISTINCT t.id) as tag_count
          FROM users u
          JOIN tags t ON t.tagged_entity_id = u.id AND t.tagged_entity_type = 'user'
          WHERE t.tag = ?
          GROUP BY u.id, u.username, u.avatar_url, u.access_token, u.scanned_by
          ORDER BY u.username ASC
        `);

        const users = usersStmt.all(tagName) as any[];

        // Get repos with this tag (from tech stack or topics)
        const reposStmt = db.prepare(`
          SELECT DISTINCT
            r.name,
            r.description,
            r.url,
            r.stars,
            u.username,
            u.avatar_url
          FROM repositories r
          JOIN users u ON r.user_id = u.id
          WHERE r.language = ? OR r.user_id IN (
            SELECT user_id FROM tech_stack WHERE technology = ?
          )
          ORDER BY r.stars DESC, r.name ASC
        `);

        const repos = reposStmt.all(tagName, tagName) as any[];

        return new Response(JSON.stringify({
          tag: tagName,
          users: users.map(u => ({
            username: u.username,
            avatar_url: u.avatar_url,
            user_type: u.user_type,
            tag_count: u.tag_count
          })),
          repositories: repos.map(r => ({
            name: r.name,
            description: r.description,
            url: r.url,
            stars: r.stars,
            username: r.username
          }))
        }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Tag detail query error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch tag data" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/location.html") {
      const file = Bun.file("./public/location.html");
      return new Response(file);
    }

    if (url.pathname === "/api/repo-forks") {
      // Get fork connections for a specific repository
      const owner = url.searchParams.get("owner");
      const repoName = url.searchParams.get("repo");

      if (!owner || !repoName) {
        return new Response(JSON.stringify({ error: "Missing owner or repo parameter" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        // Get users who forked this repo (in our system)
        const forkedByStmt = db.prepare(`
          SELECT DISTINCT
            f.forker_username,
            u.avatar_url,
            CASE
              WHEN u.access_token IS NOT NULL THEN 'authenticated'
              WHEN u.scanned_by IS NOT NULL THEN 'scanned'
              ELSE 'unscanned'
            END as user_type
          FROM forks f
          LEFT JOIN users u ON u.username = f.forker_username
          WHERE f.repo_owner = ? AND f.repo_name = ?
          ORDER BY f.forker_username ASC
        `);

        const forkedBy = forkedByStmt.all(owner, repoName) as any[];

        // Check if this repo itself is a fork (look in repositories table)
        const forkedFromStmt = db.prepare(`
          SELECT DISTINCT
            r.fork_parent_owner,
            r.fork_parent_repo,
            u.avatar_url as parent_avatar,
            CASE
              WHEN u.access_token IS NOT NULL THEN 'authenticated'
              WHEN u.scanned_by IS NOT NULL THEN 'scanned'
              ELSE 'unscanned'
            END as parent_user_type
          FROM repositories r
          LEFT JOIN users u ON u.username = r.fork_parent_owner
          WHERE r.user_id = (SELECT id FROM users WHERE username = ?)
            AND r.name = ?
            AND r.is_fork = 1
            AND r.fork_parent_owner IS NOT NULL
        `);

        const forkedFrom = forkedFromStmt.get(owner, repoName) as any;

        return new Response(JSON.stringify({
          owner,
          repo_name: repoName,
          forked_by: forkedBy.map(f => ({
            username: f.forker_username,
            avatar_url: f.avatar_url,
            user_type: f.user_type
          })),
          forked_from: forkedFrom ? {
            owner: forkedFrom.fork_parent_owner,
            repo: forkedFrom.fork_parent_repo,
            avatar_url: forkedFrom.parent_avatar,
            user_type: forkedFrom.parent_user_type
          } : null
        }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Repo forks query error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch fork data" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/api/tech") {
      // Get all repos and users for a specific technology
      const tag = url.searchParams.get("tag");

      if (!tag) {
        return new Response(JSON.stringify({ error: "Missing tag parameter" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        // Find repos with this technology (from tech_stack, ai_assistance, or services)
        const reposStmt = db.prepare(`
          SELECT DISTINCT
            r.name,
            r.description,
            r.url,
            r.stars,
            u.username,
            u.avatar_url
          FROM repositories r
          JOIN users u ON r.user_id = u.id
          WHERE r.user_id IN (
            SELECT DISTINCT user_id FROM tech_stack WHERE technology = ?
            UNION
            SELECT DISTINCT user_id FROM ai_assistance WHERE ai_tool = ?
            UNION
            SELECT DISTINCT user_id FROM services WHERE service_name = ?
          )
          AND (
            r.language = ?
            OR r.user_id IN (SELECT user_id FROM tech_stack WHERE technology = ?)
          )
          ORDER BY r.stars DESC, r.name ASC
        `);

        const repos = reposStmt.all(tag, tag, tag, tag, tag) as any[];

        // Find users who use this technology
        const usersStmt = db.prepare(`
          SELECT DISTINCT
            u.username,
            u.avatar_url,
            COUNT(DISTINCT r.id) as repo_count,
            CASE
              WHEN u.access_token IS NOT NULL THEN 'authenticated'
              WHEN u.scanned_by IS NOT NULL THEN 'scanned'
              ELSE 'unscanned'
            END as user_type
          FROM users u
          LEFT JOIN repositories r ON r.user_id = u.id
          WHERE u.id IN (
            SELECT DISTINCT user_id FROM tech_stack WHERE technology = ?
            UNION
            SELECT DISTINCT user_id FROM ai_assistance WHERE ai_tool = ?
            UNION
            SELECT DISTINCT user_id FROM services WHERE service_name = ?
          )
          GROUP BY u.id, u.username, u.avatar_url, u.access_token, u.scanned_by
          ORDER BY repo_count DESC, u.username ASC
        `);

        const users = usersStmt.all(tag, tag, tag) as any[];

        return new Response(JSON.stringify({
          tag,
          repositories: repos.map(r => ({
            name: r.name,
            description: r.description,
            url: r.url,
            stars: r.stars,
            username: r.username
          })),
          users: users.map(u => ({
            username: u.username,
            avatar_url: u.avatar_url,
            repo_count: u.repo_count,
            user_type: u.user_type
          }))
        }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Tech query error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch technology data" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/tech.html") {
      const file = Bun.file("./public/tech.html");
      return new Response(file);
    }

    if (url.pathname === "/tag.html") {
      const file = Bun.file("./public/tag.html");
      return new Response(file);
    }

    if (url.pathname === "/api/relationship") {
      // Get relationship between logged-in user and profile being viewed
      const viewerUsername = url.searchParams.get("viewer");
      const profileUsername = url.searchParams.get("profile");

      if (!viewerUsername || !profileUsername) {
        return new Response(JSON.stringify({ error: "Missing viewer or profile parameter" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Don't show relationship if viewing own profile
      if (viewerUsername === profileUsername) {
        return new Response(JSON.stringify({ relationships: [] }), {
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        const relationships = [];

        // Check if viewer follows profile
        const viewerFollowsStmt = db.prepare(`
          SELECT 1 FROM social_connections
          WHERE user_id = (SELECT id FROM users WHERE username = ?)
            AND github_username = ?
            AND connection_type = 'following'
        `);
        const viewerFollows = viewerFollowsStmt.get(viewerUsername, profileUsername);

        // Check if profile follows viewer
        const profileFollowsStmt = db.prepare(`
          SELECT 1 FROM social_connections
          WHERE user_id = (SELECT id FROM users WHERE username = ?)
            AND github_username = ?
            AND connection_type = 'following'
        `);
        const profileFollows = profileFollowsStmt.get(profileUsername, viewerUsername);

        // Determine follow relationship
        if (viewerFollows && profileFollows) {
          relationships.push({ type: 'mutual_follow', label: 'Mutual Follow' });
        } else if (viewerFollows) {
          relationships.push({ type: 'following', label: 'You Follow' });
        } else if (profileFollows) {
          relationships.push({ type: 'follower', label: 'Follows You' });
        }

        // Check for shared repos via forks
        const sharedForksStmt = db.prepare(`
          SELECT COUNT(*) as count FROM (
            SELECT repo_owner, repo_name FROM forks WHERE forker_username = ?
            INTERSECT
            SELECT repo_owner, repo_name FROM forks WHERE forker_username = ?
          )
        `);
        const sharedForks = sharedForksStmt.get(viewerUsername, profileUsername) as any;
        if (sharedForks.count > 0) {
          relationships.push({ type: 'shared_forks', label: `${sharedForks.count} Shared Fork${sharedForks.count > 1 ? 's' : ''}` });
        }

        // Check if viewer has contributed to profile's repos
        const contributedToStmt = db.prepare(`
          SELECT COUNT(DISTINCT repo_name) as count
          FROM contributors
          WHERE repo_owner = ? AND contributor_username = ?
        `);
        const contributedTo = contributedToStmt.get(profileUsername, viewerUsername) as any;
        if (contributedTo.count > 0) {
          relationships.push({ type: 'contributor', label: `Contributed to ${contributedTo.count} Repo${contributedTo.count > 1 ? 's' : ''}` });
        }

        // Check if profile has contributed to viewer's repos
        const receivedContributionsStmt = db.prepare(`
          SELECT COUNT(DISTINCT repo_name) as count
          FROM contributors
          WHERE repo_owner = ? AND contributor_username = ?
        `);
        const receivedContributions = receivedContributionsStmt.get(viewerUsername, profileUsername) as any;
        if (receivedContributions.count > 0) {
          relationships.push({ type: 'received_contribution', label: `Contributed to Your ${receivedContributions.count} Repo${receivedContributions.count > 1 ? 's' : ''}` });
        }

        // Check for shared tags
        const sharedTagsStmt = db.prepare(`
          SELECT COUNT(DISTINCT t1.tag) as count
          FROM tags t1
          JOIN tags t2 ON t1.tag = t2.tag
          WHERE t1.tagged_entity_type = 'user'
            AND t2.tagged_entity_type = 'user'
            AND t1.tagged_entity_id = (SELECT id FROM users WHERE username = ?)
            AND t2.tagged_entity_id = (SELECT id FROM users WHERE username = ?)
        `);
        const sharedTags = sharedTagsStmt.get(viewerUsername, profileUsername) as any;
        if (sharedTags.count > 0) {
          relationships.push({ type: 'shared_tags', label: `${sharedTags.count} Shared Tag${sharedTags.count > 1 ? 's' : ''}` });
        }

        return new Response(JSON.stringify({ relationships }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (error) {
        console.error("Relationship query error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch relationship" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/api/stats") {
      // Get homepage statistics
      try {
        // Total users
        const totalUsersStmt = db.prepare("SELECT COUNT(*) as count FROM users");
        const totalUsers = (totalUsersStmt.get() as any).count;

        // Total authenticated users (logged in with green glow)
        const authenticatedUsersStmt = db.prepare("SELECT COUNT(*) as count FROM users WHERE access_token IS NOT NULL");
        const authenticatedUsers = (authenticatedUsersStmt.get() as any).count;

        // Total repositories
        const totalReposStmt = db.prepare("SELECT COUNT(*) as count FROM repositories");
        const totalRepos = (totalReposStmt.get() as any).count;

        // Total unique technologies
        const totalTechStmt = db.prepare(`
          SELECT COUNT(DISTINCT technology) as count FROM (
            SELECT technology FROM tech_stack
            UNION
            SELECT ai_tool as technology FROM ai_assistance
            UNION
            SELECT service_name as technology FROM services
          )
        `);
        const totalTech = (totalTechStmt.get() as any).count;

        // Recent authenticated users (logged in, limit 6)
        const recentAuthUsersStmt = db.prepare(`
          SELECT
            username,
            avatar_url,
            'authenticated' as user_type,
            COALESCE(last_scan, created_at) as activity_date
          FROM users
          WHERE access_token IS NOT NULL
          ORDER BY activity_date DESC
          LIMIT 6
        `);
        const recentAuthUsers = recentAuthUsersStmt.all() as any[];

        // Recent scanned users (all scanned including authenticated, limit 6)
        const recentScannedStmt = db.prepare(`
          SELECT
            username,
            avatar_url,
            CASE
              WHEN access_token IS NOT NULL THEN 'authenticated'
              WHEN scanned_by IS NOT NULL THEN 'scanned'
              ELSE 'unscanned'
            END as user_type,
            COALESCE(last_scan, created_at) as activity_date
          FROM users
          WHERE access_token IS NOT NULL OR scanned_by IS NOT NULL
          ORDER BY activity_date DESC
          LIMIT 6
        `);
        const recentScanned = recentScannedStmt.all() as any[];

        // Popular technologies (top 20)
        const popularTechStmt = db.prepare(`
          SELECT
            tech as name,
            user_count,
            CASE
              WHEN tech IN (SELECT ai_tool FROM ai_assistance) THEN 'blue'
              WHEN tech IN (SELECT service_name FROM services) THEN 'green'
              ELSE 'gray'
            END as color
          FROM (
            SELECT technology as tech, COUNT(DISTINCT user_id) as user_count FROM tech_stack GROUP BY technology
            UNION ALL
            SELECT ai_tool as tech, COUNT(DISTINCT user_id) as user_count FROM ai_assistance GROUP BY ai_tool
            UNION ALL
            SELECT service_name as tech, COUNT(DISTINCT user_id) as user_count FROM services GROUP BY service_name
          )
          GROUP BY tech
          ORDER BY user_count DESC
          LIMIT 20
        `);
        const popularTech = popularTechStmt.all() as any[];

        return new Response(JSON.stringify({
          total_users: totalUsers,
          authenticated_users: authenticatedUsers,
          total_repos: totalRepos,
          total_technologies: totalTech,
          recent_auth_users: recentAuthUsers.map(u => ({
            username: u.username,
            avatar_url: u.avatar_url,
            user_type: u.user_type
          })),
          recent_scanned: recentScanned.map(u => ({
            username: u.username,
            avatar_url: u.avatar_url,
            user_type: u.user_type
          })),
          popular_tech: popularTech.map(t => ({
            name: t.name,
            user_count: t.user_count,
            color: t.color
          }))
        }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Stats query error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch stats" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  }
});

console.log(`🚀 Branch server running on port ${PORT}`);
