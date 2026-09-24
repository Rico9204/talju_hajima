-- Repair legacy read receipts whose project does not match their message.
-- Keep a receipt only when its reader is a member of the message's project.
update message_reads r
set project_id = c.project_id
from chat_messages c
join members m on m.id = r.member_id
where r.message_id = c.id
  and r.project_id <> c.project_id
  and m.project_id = c.project_id;

-- Receipts whose reader is not a member of the message's project cannot
-- represent a valid read and would otherwise display as an unknown profile.
delete from message_reads r
using chat_messages c
where r.message_id = c.id
  and r.project_id <> c.project_id;

do $$ begin
  alter table chat_messages add constraint chat_messages_id_project_unique unique (id, project_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table message_reads add constraint message_reads_message_project_fk
    foreign key (message_id, project_id) references chat_messages(id, project_id) on delete cascade;
exception when duplicate_object then null;
end $$;

drop policy if exists message_reads_insert on message_reads;
create policy message_reads_insert on message_reads for insert
  with check (
    is_project_member(project_id)
    and exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid())
    and exists (select 1 from chat_messages c where c.id = message_id and c.project_id = message_reads.project_id)
  );
