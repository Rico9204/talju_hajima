-- Add last_seen_at column to members to record the teammate's last active timestamp
alter table public.members add column if not exists last_seen_at timestamptz default now();

-- Grant select permission on last_seen_at to authenticated users
do $$
begin
  execute 'grant select (last_seen_at) on public.members to authenticated';
exception when others then
  null;
end $$;

-- RPC to update the current signed-in user's own member last_seen_at timestamp
create or replace function public.touch_member_presence(p_member_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.members
  set last_seen_at = now()
  where id = p_member_id and user_id = auth.uid();
end;
$$;

revoke all on function public.touch_member_presence(uuid) from public, anon;
grant execute on function public.touch_member_presence(uuid) to authenticated;
