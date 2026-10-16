-- Run this once for existing projects so text uploads can be searched by content.
alter table files add column if not exists content text;
alter table files add column if not exists file_data text;