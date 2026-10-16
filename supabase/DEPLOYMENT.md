# Supabase deployment checks

`supabase/schema.sql` is the complete baseline for a new Supabase project. Apply it as one unit; do not copy individual function definitions from it because later definitions intentionally replace earlier compatibility versions.

Existing projects should apply the specific feature migration that accompanies a code change. New database changes should be added as a timestamped SQL file under `supabase/migrations/` and should be safe to run once on an already deployed project.

Before deploying frontend code that depends on Supabase changes:

1. Apply the baseline schema or the required feature migration in the Supabase SQL Editor.
2. Run `supabase/verify_runtime.sql` in the same editor.
3. Confirm every result has `ready = true`.
4. Test one upload, one workspace version registration, and one project completion in a non-production project.

The verification query is read-only. It detects the missing RPC, storage bucket, and storage policy conditions that otherwise appear in the app as schema-cache, bucket-not-found, or row-level-security errors.
