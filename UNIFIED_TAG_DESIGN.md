# Unified Tag System Design

## Goal
Create a single, universal tag system where ALL tags (tech, AI tools, services, user-created) can be applied to BOTH users AND repos.

## Current Problems
1. Tech stack tags (languages/frameworks) stored in separate `tech_stack` table - only for users
2. AI tools stored in separate `ai_assistance` table - only for repos
3. Services stored in separate `services` table - only for users
4. User tags in `tags` table - can tag users or repos but separate from tech tags
5. Tag metadata in `tag_metadata` - disconnected from actual tag usage

## New Unified Schema

### Single `tags` Table
```sql
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- The tag itself
  tag_name TEXT NOT NULL,

  -- What is being tagged
  entity_type TEXT NOT NULL,  -- 'user' or 'repo'
  entity_id INTEGER NOT NULL, -- user.id or repo.id

  -- Who/what created this tag
  source_type TEXT NOT NULL,  -- 'user' or 'system'
  source_user_id INTEGER,     -- NULL if system-generated

  -- Tag categorization
  category TEXT NOT NULL,     -- 'language', 'framework', 'ai_tool', 'service', 'user_tag'

  -- For repo tags, which repo
  repo_name TEXT,             -- NULL for user tags

  -- Metadata
  confidence REAL DEFAULT 1.0, -- 1.0 for user tags, 0.0-1.0 for auto-detected
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (entity_id) REFERENCES users(id) OR repositories(id),
  FOREIGN KEY (source_user_id) REFERENCES users(id),

  UNIQUE(tag_name, entity_type, entity_id, repo_name)
)
```

### Tag Metadata Table (Enhanced)
```sql
CREATE TABLE tag_metadata (
  tag_name TEXT PRIMARY KEY,
  display_name TEXT,          -- Pretty name for display
  description TEXT,           -- What this tag means
  category TEXT NOT NULL,     -- 'language', 'framework', 'ai_tool', 'service', 'user_tag'
  color TEXT,                 -- UI color: 'blue', 'green', 'gray', etc.
  is_ai_stack BOOLEAN DEFAULT 0,
  icon TEXT,                  -- Optional emoji or icon
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## Migration Strategy

### Phase 1: Add New Schema Alongside Old
- Create new unified `tags_v2` table
- Keep old tables running

### Phase 2: Migrate Data
1. Migrate `tech_stack` → tags with source_type='system', category='language|framework', entity_type='user'
2. Migrate `ai_assistance` → tags with source_type='system', category='ai_tool', entity_type='repo'
3. Migrate `services` → tags with source_type='system', category='service', entity_type='user'
4. Migrate existing `tags` → tags_v2 with source_type='user', category='user_tag'
5. Migrate `tag_metadata` → new tag_metadata with enhanced fields

### Phase 3: Update Application Logic
- Rewrite all tag queries to use unified table
- Update APIs to accept tags for both users and repos
- Update UI to show all tags uniformly

### Phase 4: Cleanup
- Rename tags_v2 → tags
- Drop old tables (tech_stack, ai_assistance, services, old tags)

## Benefits

1. **Universal**: One tag = can apply to users AND repos
2. **Consistency**: All tags displayed/managed the same way
3. **Flexibility**: Users can manually tag repos with ANY tag (including tech tags)
4. **Discovery**: "Show me all repos using Claude" works the same as "Show me all users tagged 'Vibe Coder'"
5. **Simpler Code**: One query pattern for all tag operations

## Examples

```sql
-- Tag a user with "Vibe Coder" (user-created)
INSERT INTO tags (tag_name, entity_type, entity_id, source_type, source_user_id, category)
VALUES ('Vibe Coder', 'user', 123, 'user', 456, 'user_tag');

-- Tag a repo with "Claude" (system-detected)
INSERT INTO tags (tag_name, entity_type, entity_id, source_type, category, repo_name)
VALUES ('Claude', 'repo', 789, 'system', 'ai_tool', 'branch');

-- Tag a user with "TypeScript" (system-detected from their repos)
INSERT INTO tags (tag_name, entity_type, entity_id, source_type, category)
VALUES ('TypeScript', 'user', 123, 'system', 'language');

-- Tag a specific repo with "TypeScript" (system-detected from repo language)
INSERT INTO tags (tag_name, entity_type, entity_id, source_type, category, repo_name)
VALUES ('TypeScript', 'repo', 789, 'system', 'language', 'branch');
```

## UI Changes

### User Profile
```
Tags: [Vibe Coder] [Claude] [TypeScript] [Portland, OR]
      ^user tag    ^ai tool  ^language    ^user tag
```

### Repo Card
```
branch
TypeScript  Claude  Bun
^language   ^ai     ^framework
(All clickable, all filterable, all in AI Stack if marked)
```

### Tag Page (e.g., /tech.html?tag=Claude)
Shows:
- Users who use Claude (across any of their repos)
- Specific repos that use Claude
- Can filter by entity type
