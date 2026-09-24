# New migrations

Add new production database changes here using a sortable filename such as `2609211430_add_feature.sql`.

Each migration must contain the complete final definition for every function it changes, include required grants and policies, and be safe to apply to an existing project. After applying it, run `../verify_runtime.sql` when the change affects a runtime RPC or workspace storage.

Files dated 2609122251–2609211713 were moved here from the old `supabase\migration_<topic>.sql` naming; their timestamp is the first git commit time to the minute (bumped by a minute where two files shared one), so filename order is the real apply order.
