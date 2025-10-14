# 🌳 Branch

**Discover what technologies you actually use.**

Branch analyzes your GitHub repositories to show you a complete picture of your tech stack - languages, frameworks, and tools you work with most.

## Features

- 🔐 GitHub OAuth login
- 🔍 Automatic repository scanning
- 📊 Tech stack analysis (languages + frameworks/tools)
- 📈 Visual breakdown with usage statistics
- ⚡ Built with Bun for blazing fast performance

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
2. **Scan** - Fetches all your repositories (max 100)
3. **Analyze** - Counts languages and topics across repos
4. **Display** - Shows ranked tech stack with usage stats

## Tech Stack

- **Runtime:** Bun
- **Database:** SQLite (via Bun's built-in sqlite)
- **Frontend:** Vanilla HTML/CSS/JS
- **Auth:** GitHub OAuth

## API Endpoints

- `GET /` - Landing page
- `GET /dashboard.html` - Dashboard
- `GET /api/auth/github` - Start OAuth flow
- `GET /api/auth/callback` - OAuth callback
- `GET /api/scan?username=<user>` - Scan repos
- `GET /api/techstack?username=<user>` - Get tech stack

## Database Schema

### users
- `id` - Primary key
- `github_id` - GitHub user ID (unique)
- `username` - GitHub username
- `avatar_url` - Profile picture
- `access_token` - OAuth token (encrypted in production!)
- `created_at` - First login
- `last_scan` - Last repo scan

### tech_stack
- `id` - Primary key
- `user_id` - Foreign key to users
- `technology` - Name (e.g., "JavaScript", "react")
- `category` - "language" or "framework"
- `repo_count` - How many repos use it
- `updated_at` - Last update

## MVP Scope (Current)

✅ Feature 1: GitHub OAuth Login
✅ Feature 2: Auto-Scan on Login
✅ Feature 3: Display Tech Stack

## Future Ideas (Post-MVP)

- View other users' tech stacks
- Follow developers and get recommendations
- Track tech stack changes over time
- Integration with GitHub Graph Spider
- Export/share your tech stack

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
   - Set **Mount Path**: `/app`
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
