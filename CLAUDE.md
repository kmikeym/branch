# CLAUDE.md - Branch Project

## Project Overview

Branch is a personal tech stack analyzer that uses GitHub data to show what technologies you actually use across all your repositories.

## Minimum Viable Product Scope

**Goal:** User logs in with GitHub → See their own tech stack analyzed from their repos

---

## Features (MVP Only)

### ✅ Feature 1: GitHub OAuth Login

- "Login with GitHub" button
- OAuth flow completes
- User lands on dashboard with their username/avatar

### ✅ Feature 2: Auto-Scan on Login

- When user logs in, automatically fetch their repos
- Analyze tech stack from:
  - Repository languages
  - Repository topics/tags
  - Count usage across all repos

### ✅ Feature 3: Display Tech Stack

- Show categorized list:
  - Languages: JavaScript (15 repos), Python (8 repos)
  - Frameworks/Tools: React (12 repos), Docker (6 repos)
- Show as simple list or bar chart
- Display total repos analyzed

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

## Out of Scope (Post-MVP)

- Viewing other users' tech stacks
- Social features (following, recommendations)
- Advanced filtering/search
- Historical tracking of tech stack changes
- Integration with GitHub Graph Spider

---

## Development Notes

This is a focused MVP to validate the core value proposition: "What tech do I actually use?"

Keep it simple, ship it fast, iterate based on real usage.
