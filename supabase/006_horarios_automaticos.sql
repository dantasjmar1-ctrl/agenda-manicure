-- Horários automáticos: a rotina semanal fica no banco e os horários dos próximos dias
-- são criados sozinhos (ninguém precisa clicar em "gerar"). Dias fechados são pulados.

create table if not exists weekly_hours (
  weekday int  not null check (weekday between 0 and 6),   -- 0 = domingo ... 6 = sábado
  at      time not null,                                    -- horário no fuso de Brasília
  primary key (weekday, at)
);
alter table weekly_hours enable row level security;
drop policy if exists weekly_hours_owner on weekly_hours;
create policy weekly_hours_owner on weekly_hours for all using (is_owner()) with check (is_owner());
grant select, insert, delete on weekly_hours to authenticated;

-- Rotina combinada (ajustável depois no painel)
insert into weekly_hours (weekday, at) values
  (2,'09:00'),(2,'11:30'),(2,'14:00'),(2,'16:30'),(2,'18:30'),
  (3,'09:00'),(3,'11:30'),(3,'14:00'),(3,'16:30'),
  (4,'09:00'),(4,'11:30'),(4,'14:00'),(4,'16:30'),(4,'18:30'),
  (5,'09:00'),(5,'11:30'),(5,'14:00'),(5,'16:30'),(5,'18:30'),
  (6,'09:00'),(6,'11:30'),(6,'14:30')
on conflict do nothing;

alter table settings add column if not exists horizon_days int not null default 60;   -- quantos dias à frente ficam abertos

create or replace function ensure_slots() returns void
language plpgsql security definer as $$
declare v_days int; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select horizon_days into v_days from settings;
  insert into slots (starts_at)
  select ((v_today + i) + w.at) at time zone 'America/Sao_Paulo'
    from generate_series(0, v_days) as i
    join weekly_hours w on w.weekday = extract(dow from (v_today + i))::int
   where not exists (select 1 from closed_days c where c.day = v_today + i)
     and (((v_today + i) + w.at) at time zone 'America/Sao_Paulo') > now()
  on conflict (starts_at) do nothing;
end $$;
grant execute on function ensure_slots() to authenticated;

create or replace function public_slots()
returns table(id uuid, starts_at timestamptz)
language plpgsql security definer as $$
begin
  perform release_expired_holds();
  perform ensure_slots();
  return query select s.id, s.starts_at from slots s
   where s.status = 'free' and s.starts_at > now() order by s.starts_at;
end $$;
grant execute on function public_slots() to anon;

-- Tirar um horário da rotina: some também dos dias futuros que estão livres e sem cliente
create or replace function remove_weekly_hour(p_weekday int, p_at time) returns void
language plpgsql security definer as $$
begin
  if not is_owner() then raise exception 'forbidden'; end if;
  delete from weekly_hours where weekday = p_weekday and at = p_at;
  delete from slots s
   where s.status = 'free' and s.starts_at > now()
     and extract(dow from (s.starts_at at time zone 'America/Sao_Paulo'))::int = p_weekday
     and (s.starts_at at time zone 'America/Sao_Paulo')::time = p_at
     and not exists (select 1 from bookings b where b.slot_id = s.id);
end $$;
grant execute on function remove_weekly_hour(int, time) to authenticated;
