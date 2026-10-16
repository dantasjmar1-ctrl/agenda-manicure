-- Dias fechados (viagem, folga): ficam guardados mesmo que ainda não existam horários nesses dias.
-- Ao gerar horários, os dias fechados são pulados.
create table if not exists closed_days (day date primary key);
alter table closed_days enable row level security;
drop policy if exists closed_days_owner on closed_days;
create policy closed_days_owner on closed_days for all using (is_owner()) with check (is_owner());
grant select, insert, delete on closed_days to authenticated;
