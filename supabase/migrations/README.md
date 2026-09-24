# New migrations

Add new production database changes here using a sortable filename such as `20260921143000_add_feature.sql`.

Each migration must contain the complete final definition for every function it changes, include required grants and policies, and be safe to apply to an existing project. After applying it, run `../verify_runtime.sql` when the change affects a runtime RPC or workspace storage.

Files dated 20260912–20260921171324 were moved here from the old `supabase\migration_<topic>.sql` naming; their timestamp is the file's first git commit time (real apply order).
