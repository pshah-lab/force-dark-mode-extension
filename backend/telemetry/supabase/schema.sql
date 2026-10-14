-- One row per install per UTC day. install_id is a random UUID created at opt-in.
create table if not exists heartbeats (
  install_id uuid not null,
  day        date not null,
  version    text not null,
  chrome     int  not null,
  os         text not null,
  lang       text not null,
  engines    jsonb not null,
  theme      text not null,
  features   jsonb not null,
  primary key (install_id, day)
);

-- Service-role key (used by the functions) bypasses RLS; with no policies the anon and
-- authenticated roles can read and write nothing.
alter table heartbeats enable row level security;

create index if not exists heartbeats_day_idx on heartbeats (day);
