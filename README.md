# 🌳 Branch

**Discover what technologies you actually use.**

Branch analyzes your GitHub repositories to show you a complete picture of your tech stack - languages, frameworks, and tools you work with most.

## Features

### Core Features
- 🔐 **GitHub OAuth login** - Secure authentication with GitHub
- 🔍 **Automatic repository scanning** - Analyzes repos for tech stack
- 📊 **Tech stack analysis** - Languages, frameworks, tools, and AI assistance
- 🤖 **AI tool detection** - Identifies Claude, ChatGPT, Copilot, and more
- 🏷️ **Smart tagging system** - Tag users and automatically tag "Vibe Coders"
- 👥 **Social connections** - View followers, following, and tech stack overlap
- 🌐 **GitHub network integration** - See forks and contributors
- 📈 **Visual breakdown** - Usage statistics and repository details
- ⚡ **Built with Bun** - Blazing fast performance

### User Experience
- 🎨 **Vibe Coding section** - Dedicated showcase for AI-assisted developers
- 👤 **Profile names** - Shows real names (e.g., "K. Mike Merrill") not just usernames
- 💀 **Skeleton UI** - Friendly loading states for unscanned profiles
- ⚡ **Fast scan option** - Quick profile scan without full repo analysis
- 🚀 **Full scan option** - Complete tech stack analysis
- 📊 **Stats dashboard** - Total users, repos, technologies tracked

## Quick Start

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Set Up GitHub OAuth

Create a new OAuth App at https://github.com/settings/developers

- **Application name:** Branch (or whatever you like)
- **Homepage URL:** `http://localhost:3000`
- **Authorization callback URL:** `http://localhost:3000/api/auth/callback`

Copy the Client ID and Client Secret.

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your GitHub credentials
```

### 4. Run the Server

```bash
bun run index.ts
```

Visit http://localhost:3000 and login with GitHub!

## How It Works

1. **Login** - OAuth flow with GitHub
2. **Scan** - Fetches your repositories and README files
3. **Analyze** - Detects:
   - Programming languages
   - Frameworks and tools from topics
   - AI tools mentioned in READMEs (Claude, ChatGPT, Copilot, etc.)
   - GitHub services used
4. **Tag** - Automatically tags "Vibe Coders" who use AI tools
5. **Connect** - Imports social network (followers, following)
6. **Display** - Shows comprehensive tech stack with usage stats

## Tech Stack

- **Runtime:** Bun
- **Database:** SQLite (via Bun's built-in sqlite)
- **Frontend:** Vanilla HTML/CSS/JS
- **Auth:** GitHub OAuth

## API Endpoints

### Pages
- `GET /` - Landing page with stats and vibe coding section
- `GET /dashboard.html` - User profile dashboard
- `GET /tech.html` - Technology detail page
- `GET /tag.html` - Tag detail page

### Authentication
- `GET /api/auth/github` - Start OAuth flow
- `GET /api/auth/callback` - OAuth callback
- `GET /api/logout` - Logout user

### Data & Scanning
- `GET /api/scan?username=<user>&scanner=<scanner>` - Full repo scan with README analysis
- `GET /api/rescan-profile?username=<user>&scanner=<scanner>` - Fast profile-only scan
- `GET /api/rescan?username=<user>&scanner=<scanner>` - Rescan existing user
- `GET /api/techstack?username=<user>` - Get user's tech stack
- `GET /api/stats` - Homepage statistics (users, repos, popular tech)
- `GET /api/technology?name=<tech>` - Get users and repos for a technology
- `GET /api/tag?name=<tag>` - Get users and repos for a tag

### Social
- `GET /api/followers?username=<user>` - Get user's followers
- `GET /api/following?username=<user>` - Get users they follow

### Tagging
- `POST /api/tag` - Add tag to user or repo
- `DELETE /api/tag` - Remove tag

## Database Schema

### users
- `id` - Primary key
- `github_id` - GitHub user ID (unique)
- `username` - GitHub username
- `name` - Real name (e.g., "K. Mike Merrill")
- `bio` - Profile bio
- `avatar_url` - Profile picture
- `access_token` - OAuth token (encrypted in production!)
- `user_type` - "authenticated" or "scanned"
- `followers_count` - Number of followers
- `following_count` - Number following
- `created_at` - First login
- `last_scan` - Last repo scan

### repositories
- `id` - Primary key
- `user_id` - Foreign key to users
- `name` - Repository name
- `description` - Repository description
- `url` - GitHub URL
- `stars` - Star count
- `language` - Primary language
- `created_at` - Repo creation date

### tech_stack
- `id` - Primary key
- `user_id` - Foreign key to users
- `technology` - Name (e.g., "JavaScript", "react")
- `category` - "language", "framework", or "topic"
- `repo_count` - How many repos use it
- `updated_at` - Last update

### ai_assistance
- `id` - Primary key
- `user_id` - Foreign key to users
- `repo_id` - Foreign key to repositories
- `ai_tool` - Name of AI tool (e.g., "Claude", "ChatGPT")

### services
- `id` - Primary key
- `user_id` - Foreign key to users
- `service_name` - GitHub service name

### tags
- `id` - Primary key
- `tagged_by_user_id` - Who added the tag
- `tagged_entity_type` - "user" or "repository"
- `tagged_entity_id` - ID of tagged entity
- `tag` - Tag text (e.g., "Vibe Coder")

### social_connections
- `id` - Primary key
- `user_id` - Foreign key to users
- `connection_user_id` - Foreign key to connected user
- `connection_type` - "follower" or "following"

### forks
- `id` - Primary key
- `repo_id` - Foreign key to repositories
- `forked_from_user` - Original user
- `forked_from_repo` - Original repo name

### contributors
- `id` - Primary key
- `repo_id` - Foreign key to repositories
- `contributor_username` - GitHub username
- `contributions` - Number of contributions

## Implementation Status

### ✅ Completed Features

**Core MVP**
- ✅ GitHub OAuth Login
- ✅ Auto-Scan on Login
- ✅ Display Tech Stack

**Extended Features**
- ✅ View other users' tech stacks
- ✅ Social connections (followers/following)
- ✅ AI tool detection from READMEs
- ✅ Smart tagging system
- ✅ Auto-tagging for "Vibe Coders"
- ✅ Technology and tag detail pages
- ✅ Homepage stats dashboard
- ✅ Skeleton UI for unscanned profiles (Issue #2)
- ✅ Profile names instead of usernames
- ✅ Fast profile scan option
- ✅ Vibe Coding section on homepage
- ✅ Repository tracking with forks and contributors

### 🚧 Future Ideas

- Track tech stack changes over time
- Export/share your tech stack as image
- Technology recommendations
- Developer discovery based on tech overlap
- Integration with GitHub Graph Spider
- Advanced filtering and search

## Deployment

### Option 1: Railway (Recommended - Easiest) 🚂

Railway has native Bun support and is the fastest way to deploy.

1. **Push to GitHub:**
   ```bash
   cd /Users/kmikeym/Projects/Branch
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create branch --public --source=. --push
   ```

2. **Deploy to Railway:**
   - Visit [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your `branch` repository
   - Railway will auto-detect Bun

3. **Configure Environment:**
   - Go to your project → Variables tab
   - Add: `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
   - Railway will provide your public URL (e.g., `branch-production.up.railway.app`)

4. **Update GitHub OAuth App:**
   - Go to https://github.com/settings/developers
   - Update your OAuth app callback URL to: `https://your-app.up.railway.app/api/auth/callback`

5. **⚠️ CRITICAL: Add Persistent Storage (DO THIS NOW!)**

   **Without this step, your database will be wiped on every deployment!**

   - In Railway project view, click **"+ New"** button
   - Select **"Volume"**
   - Name it: `branch-database` (or any name you like)
   - Size: 1 GB (free tier includes this)
   - Click **"Add Volume"**
   - After volume is created, click on it
   - Set **Mount Path**: `/data`
   - Click **"Save"**
   - Your app will redeploy automatically

   The SQLite database file `branch.db` now persists across deployments! 🎉

   **To verify it's working:**
   - Scan some repositories
   - Push a new code change and let Railway redeploy
   - Check if your scan data is still there (it should be!)

Done! Your app is live with persistent data. 🎉

### Option 2: Fly.io 🪰

Great for edge deployment with more control.

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Create Dockerfile:**
   ```dockerfile
   FROM oven/bun:1
   WORKDIR /app
   COPY . .
   RUN bun install
   EXPOSE 3000
   CMD ["bun", "run", "index.ts"]
   ```

3. **Initialize and Deploy:**
   ```bash
   fly launch
   fly secrets set GITHUB_CLIENT_ID=your_id GITHUB_CLIENT_SECRET=your_secret
   fly volumes create branch_data --size 1
   fly deploy
   ```

4. **Update GitHub OAuth callback** to your Fly.io URL

### Option 3: DigitalOcean App Platform 🌊

Simple deployment with predictable pricing.

1. **Push to GitHub** (same as Railway step 1)

2. **Create App:**
   - Go to [DigitalOcean Apps](https://cloud.digitalocean.com/apps)
   - Click "Create App" → Select your GitHub repo
   - Choose "Bun" as runtime

3. **Configure:**
   - Build Command: `bun install`
   - Run Command: `bun run index.ts`
   - Add environment variables for GitHub OAuth

4. **Update GitHub OAuth callback** to your DO app URL

### Troubleshooting Deployments

**If deployments are stuck or failing:**

1. **Check Railway Status First:** https://status.railway.app/
   - Railway sometimes has platform outages that affect all users
   - If there's an active incident, just wait for it to resolve
   - Don't waste time debugging if it's a Railway infrastructure issue!

2. **Check deployment logs:**
   - Click "View Logs" on the stuck deployment
   - Look for actual error messages (not just "Initializing")

3. **Common issues:**
   - Missing environment variables
   - Database volume not mounted correctly
   - Code syntax errors (should show in build logs)

### Post-Deployment Checklist

- [ ] Update GitHub OAuth callback URL to production domain
- [ ] Test login flow end-to-end
- [ ] Verify SQLite database persists between deploys
- [ ] Check logs for any errors
- [ ] Test with your own GitHub account

## Development

See [CLAUDE.md](CLAUDE.md) for detailed project context and instructions.

## License

MIT

---

Part of the [Quarterly Systems](https://quarterly.systems) ecosystem
