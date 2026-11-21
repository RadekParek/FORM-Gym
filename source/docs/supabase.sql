-- Run once in the hosting project's SQL editor. Only the server may read this row.
create table if not exists public.form_state (
  id text primary key check (id = 'primary'),
  payload jsonb not null
);
alter table public.form_state enable row level security;
revoke all on public.form_state from anon, authenticated;
grant all on public.form_state to service_role;
