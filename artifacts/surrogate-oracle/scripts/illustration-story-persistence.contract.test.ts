import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const edgeFunction = readFileSync(
  new URL('../../../supabase/functions/oracle-story-film-job/index.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../../../supabase/migrations/20260901000000_illustration_story_film_jobs.sql', import.meta.url),
  'utf8',
);
const cellMigration = readFileSync(
  new URL('../../../supabase/migrations/20260903000002_oracle_story_cells.sql', import.meta.url),
  'utf8',
);

assert.match(migration, /ADD COLUMN IF NOT EXISTS owner_key text/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS review_manifest jsonb/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS review_history jsonb/);
assert.match(migration, /oracle_film_jobs_story_owner_idx/);
assert.match(cellMigration, /CREATE TABLE IF NOT EXISTS public\.oracle_story_cells/);
assert.match(cellMigration, /expires_at timestamptz/);
assert.match(cellMigration, /UNIQUE \(job_id, page_number\)/);
assert.match(cellMigration, /oracle_story_cells_job_order_idx/);

assert.match(edgeFunction, /action === 'latest'/);
assert.match(edgeFunction, /action === 'stitch-order'/);
assert.match(edgeFunction, /oracle_story_cells/);
assert.match(edgeFunction, /no stitch request was started/);
assert.match(edgeFunction, /\.eq\('owner_key', ownerKey\)/);
assert.match(edgeFunction, /action === 'create-local'/);
assert.match(edgeFunction, /panels\.length !== PAGE_COUNT/);
assert.match(edgeFunction, /cellStorage: 'perishable-postgres-manifest'/);
assert.match(edgeFunction, /stitchReview: 'server-ordered-cell-list-v1'/);
assert.match(edgeFunction, /media_url: cell\.mediaUrl/);
assert.match(edgeFunction, /action === 'persist-assembly'/);
assert.match(edgeFunction, /\.eq\('owner_key', requestedOwnerKey\)/);
assert.match(edgeFunction, /reviewManifestWithDurableReferences/);
assert.match(edgeFunction, /startsWith\('blob:'\)/);
assert.match(edgeFunction, /review_manifest/);
assert.match(edgeFunction, /reviewHistory/);
assert.match(edgeFunction, /reviewHistoryEntry/);

console.log('illustration story persistence contract passed (owner-scoped lookup, durable assembly, blob sanitation)');