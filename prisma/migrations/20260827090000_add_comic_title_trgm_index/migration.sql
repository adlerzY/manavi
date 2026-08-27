CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Comic_title_trgm_idx" ON "Comic" USING GIN ("title" gin_trgm_ops);