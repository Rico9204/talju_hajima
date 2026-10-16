-- Keep the chat identity constraint and allow applying this block again.
do $$ begin
  alter table public.chat_messages add constraint chat_messages_id_project_unique unique (id, project_id);
exception when duplicate_object or duplicate_table then null;
end $$;
