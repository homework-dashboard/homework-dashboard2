/*
# Add link_url column to homework_entries

1. Modified Tables
- `homework_entries`: added `link_url` text column (nullable) — stores an optional
  URL (e.g. a file or cloud-drive folder link) that is rendered as a button next to
  the homework text.

2. Security
- No new tables. Existing RLS policies on `homework_entries` already cover the new
  column (UPDATE/INSERT policies use ownership checks, not column-level grants).
*/

ALTER TABLE homework_entries ADD COLUMN IF NOT EXISTS link_url text;
