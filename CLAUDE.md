# CLAUDE.md - Branch Project

## Project Overview

Branch is a developer discovery platform that analyzes GitHub repositories to show comprehensive tech stacks including languages, frameworks, tools, and AI assistance. It has evolved from a personal tech stack analyzer into a social network for discovering developers through their technology choices.

## Project Vision

**Core Value:** Connect developers through their tech stacks and highlight the "vibe coding" community building with AI tools.

**Current Focus:**
- Showcase developers using AI-assisted development (Claude, ChatGPT, Copilot, etc.)
- Enable tech stack-based discovery and connections
- Automatic detection and tagging of "Vibe Coders"

---

## Implemented Features

### ✅ Core MVP Features

#### Feature 1: GitHub OAuth Login
- "Login with GitHub" button with permissions modal
- OAuth flow with `read:user` scope only
- User lands on dashboard with their profile
- Stores authenticated users in database with `user_type: "authenticated"`

#### Feature 2: Auto-Scan on Login
- Automatically fetches user's repositories (up to 100)
- Analyzes tech stack from multiple sources:
  - Repository languages (from GitHub API)
  - Repository topics/tags
  - README file content for AI tool mentions
  - GitHub services used (Actions, Pages, etc.)
- Counts usage across all repos
- Imports social connections (followers/following)
- Tracks repository forks and contributors

#### Feature 3: Display Tech Stack
- Comprehensive categorization:
  - Languages (JavaScript, Python, etc.)
  - Frameworks/Tools (React, Docker, etc.)
  - AI Tools (Claude, ChatGPT, Copilot, etc.)
  - GitHub Services (Actions, Pages, etc.)
- Visual breakdown with usage counts
- Repository list with details
- Social network visualization

### ✅ Extended Features (Beyond MVP)

#### Social Discovery
- **View other users:** Search and view any GitHub user's profile
- **Social connections:** Display followers and following with tech stack overlap
- **Network effects:** Show how users are connected through GitHub
- **Unscanned profiles:** Friendly skeleton UI with two scan options:
  - ⚡ Fast Profile Scan: Quick profile info only
  - 🚀 Full Repo Scan: Complete tech stack analysis

#### AI Tool Detection & Vibe Coding
- **README scanning:** Detects mentions of AI tools in repository READMEs
- **AI tools tracked:** Claude, Claude Code, ChatGPT, GitHub Copilot, Cursor, and more
- **Auto-tagging:** Automatically tags users as "Vibe Coder" when AI tools detected
- **Vibe Coding section:** Dedicated homepage section showcasing AI-assisted developers
- **Smart filtering:** Separates vibe coding tools from other popular technologies

#### Tagging System
- **User tags:** Tag users with custom labels
- **Repository tags:** Tag specific repos
- **Tag pages:** Browse users and repos by tag
- **Auto-tagging:** System automatically tags "Vibe Coders"
- **Tag attribution:** Tracks who added each tag

#### Enhanced UX
- **Profile names:** Shows real names (e.g., "K. Mike Merrill") instead of just usernames
- **Skeleton UI:** Friendly loading states for unscanned profiles (Issue #2)
- **Fast scan option:** Quick profile-only scan without full repo analysis
- **Stats dashboard:** Homepage shows total users, repos, and technologies
- **Recent activity:** Displays recently authenticated users and scanned profiles
- **Technology pages:** Dedicated pages showing all users and repos for each technology

---

## Technical Stack

- **Runtime:** Bun (JavaScript/TypeScript runtime)
- **Database:** SQLite (via Bun's built-in SQLite)
- **Frontend:** HTML/CSS/JavaScript (vanilla, keep it simple)
- **Auth:** GitHub OAuth
- **Deployment:** Railway, Fly.io, or DigitalOcean App Platform

## Deployment Options

### Option 1: Railway (Recommended - Easiest)
- Built-in Bun support
- Free tier available
- Automatic HTTPS
- Persistent disk for SQLite
- **Best for:** Quick deployment with minimal config

### Option 2: Fly.io
- Good Bun support via Docker
- Free tier with generous limits
- Persistent volumes for SQLite
- **Best for:** More control, global edge deployment

### Option 3: DigitalOcean App Platform
- Simple deployment from GitHub
- Built-in Bun support
- Starts at $5/month
- **Best for:** Predictable pricing, simple scaling

## Recent Implementation History

### Session 1: Issue #2 - Skeleton UI for Unscanned Profiles
**Problem:** Error page for unscanned users was unfriendly
**Solution:** Created skeleton UI with:
- Async fetch of GitHub user data before scanning
- Pulse animation CSS for skeleton loaders
- Two scan options: Fast Profile Scan and Full Repo Scan
- Real avatar and basic info preview

**Files Changed:**
- `public/dashboard.html`: Rewrote `showScanInvitation()` function, added `fastScanProfile()`
- `public/styles.css`: Added pulse animation keyframes

### Session 2: Profile Display Enhancement
**Problem:** Profiles showing username (@kmikeym) instead of real name
**Solution:** Updated profile header logic to prioritize name over username

**Files Changed:**
- `public/dashboard.html`: Modified `displayResults()` function (lines 550-561)

### Session 3: Vibe Coding Section
**Problem:** No dedicated space for AI-assisted development community
**Solution:** Added "🎨 Vibe Coding" section to homepage

**Features:**
- New homepage section before Popular Technologies
- Filters AI tools: Claude, Claude Code, ChatGPT, GitHub Copilot, Cursor, AI Assisted, Vibe Coder
- Separates vibe coding tools from general popular tech

**Files Changed:**
- `public/index.html`: Added section and filtering logic (lines 75-248)

### Session 4: Stats API Enhancement
**Problem:** User tags not appearing in popular_tech results
**Solution:** Extended stats API query to include tags table

**Files Changed:**
- `index.ts`: Updated `/api/stats` endpoint (lines 2282-2304)
- Added UNION ALL clause for tags with COUNT(DISTINCT tagged_entity_id)
- Tags get blue color like AI tools

### Session 5: Auto-tagging Vibe Coders
**Problem:** Manual tagging required for vibe coders
**Solution:** Automatic tagging when AI tools detected

**Implementation:**
- Added auto-tagging logic in `/api/scan` endpoint (lines 732-760)
- Checks for AI tools after README scanning
- Uses scanner's ID as tagger, or self-tags if no scanner
- Uses ON CONFLICT DO NOTHING to prevent duplicates

**Files Changed:**
- `index.ts`: Added auto-tagging after AI tool detection

---

## Architecture Notes

### Scanning Flow
1. **Authentication Scan:** User logs in → Full scan triggered automatically
2. **Profile Scan:** Click "Fast Profile Scan" → `/api/rescan-profile` → Basic info only
3. **Full Scan:** Click "Full Repo Scan" or "Rescan" → `/api/scan` → Complete analysis

### AI Tool Detection
- Scans README files for AI tool mentions
- Pattern matching for: Claude, ChatGPT, Copilot, Cursor, etc.
- Stores in `ai_assistance` table linked to user and repo
- Triggers auto-tagging as "Vibe Coder"

### Data Storage Strategy
- SQLite with persistent volume on Railway
- Normalized schema with foreign keys
- Social connections stored bidirectionally
- Tags track both tagger and tagged entity

### Frontend Architecture
- Vanilla JavaScript (no framework)
- Server-rendered HTML pages
- Client-side API calls for dynamic content
- LocalStorage for logged-in user state

---

## Development Workflow

### Local Development
```bash
bun run index.ts  # Starts server on port 3000
```

### Deployment (Railway)
- Push to GitHub main branch
- Railway auto-deploys
- Persistent volume at `/data` for `branch.db`
- Environment variables for GitHub OAuth

### Database Backup
```bash
# Local backup
cp branch.db branch.backup.db

# Railway backup
railway run cp /data/branch.db /data/backup-$(date +%Y%m%d).db
```

---

## Future Roadmap

### Phase 1: Discovery Enhancement (Current)
- ✅ AI tool detection and vibe coding community
- ✅ Social connections and network visualization
- ✅ Smart tagging system

### Phase 2: Analytics & Insights
- Tech stack change tracking over time
- Technology trend analysis
- Vibe coding adoption metrics
- Developer recommendations based on tech overlap

### Phase 3: Export & Sharing
- Tech stack badge generation
- Export as image or JSON
- Embeddable tech stack widgets
- Share profiles via URL

### Phase 4: Advanced Discovery
- GitHub Graph Spider integration
- Advanced filtering and search
- Technology-based communities
- Event detection (conference attendees, project launches)

---

## Key Decisions & Trade-offs

### Why SQLite?
- Simple deployment (no separate database service)
- Sufficient for current scale (thousands of users)
- Easy backup and migration
- Will migrate to PostgreSQL if needed at scale

### Why No Framework?
- Faster initial development for MVP
- Reduces complexity and dependencies
- Easy for anyone to contribute
- Can migrate to React/Next.js if UX complexity grows

### Why README Scanning?
- Richer signal than just GitHub API data
- Captures actual tool usage (not just installed)
- Enables AI tool detection
- Trade-off: More API calls and processing time

### Why Auto-tagging?
- Reduces manual curation burden
- Ensures consistency
- Enables real-time community growth
- Trade-off: Less control over tag quality

---

## Development Notes

Branch has evolved from "What tech do I use?" into "Discover developers through their tech stack, especially those building with AI."

The vibe coding community is the differentiator - showcasing developers embracing AI-assisted development.

Keep shipping, iterate based on community feedback.
