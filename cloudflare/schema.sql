-- D1 schema for stretch-logs (one JSON blob per dashboard key).
-- Apply in the Cloudflare dashboard (D1 > stretch-logs > Console)
-- or: wrangler d1 execute stretch-logs --file=./schema.sql
CREATE TABLE IF NOT EXISTS logs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
