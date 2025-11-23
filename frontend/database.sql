-- Enable pgcrypto for encryption helpers
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Stores encrypted Discord user payloads
CREATE TABLE IF NOT EXISTS user_profiles (
  discord_id TEXT PRIMARY KEY,
  encrypted_payload TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  guild_count INTEGER DEFAULT 0,
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Payloads are encrypted in the application layer (AES-256-GCM) before insertion.

-- Stores subscription data synchronized with Stripe/bot state
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  guild_name TEXT,
  stripe_customer_id TEXT,
  tier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  monthly_price NUMERIC(10, 2) NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_discord_id_idx ON subscriptions (discord_id);
CREATE INDEX IF NOT EXISTS subscriptions_guild_id_idx ON subscriptions (guild_id);

CREATE TABLE IF NOT EXISTS bot_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  usage TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category, name)
);

CREATE INDEX IF NOT EXISTS bot_commands_category_idx ON bot_commands (category);

-- Site analytics tracking
CREATE TABLE IF NOT EXISTS site_page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path TEXT NOT NULL,
  referrer TEXT,
  referrer_host TEXT,
  referrer_path TEXT,
  country TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS site_page_views_path_created_idx ON site_page_views (path, created_at);
CREATE INDEX IF NOT EXISTS site_page_views_created_idx ON site_page_views (created_at);

-- Bot telemetry snapshots for analytics
CREATE TABLE IF NOT EXISTS bot_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  guild_count INTEGER NOT NULL,
  active_listeners INTEGER NOT NULL,
  total_streams INTEGER NOT NULL,
  uptime_percent DOUBLE PRECISION NOT NULL,
  avg_response_ms INTEGER NOT NULL,
  voice_connections INTEGER NOT NULL,
  incidents_24h INTEGER NOT NULL,
  commands_24h INTEGER NOT NULL,
  shards_online INTEGER NOT NULL,
  shards_total INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS bot_metric_snapshots_recorded_at_idx ON bot_metric_snapshots (recorded_at);

-- User contact overrides (email/phone manually set by user)
CREATE TABLE IF NOT EXISTS user_contacts (
  discord_id TEXT PRIMARY KEY,
  email TEXT,
  phone TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User preferences stored in plaintext (non-sensitive toggles)
CREATE TABLE IF NOT EXISTS user_preferences (
  discord_id TEXT PRIMARY KEY,
  email_updates BOOLEAN DEFAULT true,
  product_updates BOOLEAN DEFAULT true,
  weekly_digest BOOLEAN DEFAULT false,
  sms_alerts BOOLEAN DEFAULT false,
  preferred_language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification subscriptions (for bot/vServer alerts)
CREATE TABLE IF NOT EXISTS user_notifications (
  discord_id TEXT PRIMARY KEY,
  maintenance_alerts BOOLEAN DEFAULT true,
  downtime_alerts BOOLEAN DEFAULT true,
  release_notes BOOLEAN DEFAULT true,
  security_notifications BOOLEAN DEFAULT true,
  beta_program BOOLEAN DEFAULT false,
  community_events BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Privacy preferences
CREATE TABLE IF NOT EXISTS user_privacy (
  discord_id TEXT PRIMARY KEY,
  profile_public BOOLEAN DEFAULT false,
  search_visibility BOOLEAN DEFAULT true,
  analytics_opt_in BOOLEAN DEFAULT false,
  data_sharing BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Security settings (metadata only, real auth handled via Discord)
CREATE TABLE IF NOT EXISTS user_security (
  discord_id TEXT PRIMARY KEY,
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret TEXT,
  login_alerts BOOLEAN DEFAULT true,
  backup_codes_remaining INTEGER DEFAULT 5,
  active_sessions INTEGER DEFAULT 1,
  last_password_change TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_bot_settings (
  discord_id TEXT PRIMARY KEY,
  auto_join_voice BOOLEAN DEFAULT true,
  announce_tracks BOOLEAN DEFAULT true,
  dj_mode BOOLEAN DEFAULT false,
  normalize_volume BOOLEAN DEFAULT true,
  default_volume INTEGER DEFAULT 70,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User roles for gated areas (default: member)
CREATE TABLE IF NOT EXISTS user_roles (
  discord_id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Active session tracking (per OAuth token hash)
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (discord_id, session_hash)
);

CREATE INDEX IF NOT EXISTS user_sessions_discord_id_idx ON user_sessions (discord_id);

-- Login activity log for audit + alert tracking
CREATE TABLE IF NOT EXISTS user_login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL,
  session_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  location TEXT,
  notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_login_events_discord_id_idx ON user_login_events (discord_id);

-- Backup codes (AES-encrypted) for account recovery
CREATE TABLE IF NOT EXISTS user_backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL,
  encrypted_code TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_backup_codes_discord_id_idx ON user_backup_codes (discord_id);

-- Blog posts managed via dashboard/admin
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT,
  read_time TEXT,
  views INTEGER DEFAULT 0,
  featured BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blog_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_identifier TEXT NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('up', 'down')),
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_identifier, reaction)
);

CREATE INDEX IF NOT EXISTS blog_reactions_post_idx ON blog_reactions (post_identifier);

CREATE TABLE IF NOT EXISTS blog_reaction_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_identifier TEXT NOT NULL,
  author_id TEXT NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('up', 'down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_identifier, author_id)
);

CREATE INDEX IF NOT EXISTS blog_reaction_votes_post_idx ON blog_reaction_votes (post_identifier);
CREATE INDEX IF NOT EXISTS blog_reaction_votes_author_idx ON blog_reaction_votes (author_id);

CREATE TABLE IF NOT EXISTS blog_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_identifier TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS blog_comments_post_idx ON blog_comments (post_identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS blog_comments_author_idx ON blog_comments (author_id);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_by TEXT,
  sent_at TIMESTAMPTZ,
  recipient_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  response TEXT,
  responded_by TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS server_settings (
  guild_id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_linked_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  handle TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS concierge_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  tier TEXT,
  contact TEXT,
  summary TEXT NOT NULL,
  hours INTEGER DEFAULT 1,
  sla_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  responded_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS concierge_requests_guild_created_idx ON concierge_requests (guild_id, created_at);

CREATE TABLE IF NOT EXISTS success_pod_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  guild_name TEXT,
  tier TEXT,
  contact TEXT,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  assigned_to TEXT,
  assigned_contact TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS success_pod_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES success_pod_requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  note TEXT,
  actor TEXT,
  actor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS success_pod_requests_guild_submitted_idx ON success_pod_requests (guild_id, submitted_at);
CREATE INDEX IF NOT EXISTS success_pod_events_request_created_idx ON success_pod_events (request_id, created_at);

CREATE TABLE IF NOT EXISTS scale_account_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT UNIQUE NOT NULL,
  manager_name TEXT,
  manager_email TEXT,
  manager_discord TEXT,
  escalation_channel TEXT,
  escalation_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
