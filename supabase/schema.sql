-- Banco do site de agendamento. Rodar uma vez no SQL Editor do Supabase.
-- Um projeto Supabase por manicure (cada uma tem o seu banco).

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------
create table services (
  id           text primary key,
  name         text not null,
  price        numeric(10,2) not null check (price >= 0),
  kind         text not null default 'principal' check (kind in ('principal','extra')),
  deposit_pct  numeric(5,2),               -- null = usa o padrão; 0 = sem sinal
  active       boolean not null default true,
  sort         int not null default 0
);

create table settings (
  id               int primary key default 1 check (id = 1),
  default_deposit_pct numeric(5,2) not null default 30,
  cancel_hours     int not null default 24,
  hold_minutes     int not null default 15
);
insert into settings default values;

create table slots (
  id        uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null unique,
  status    text not null default 'free' check (status in ('free','held','booked','blocked')),
  held_until timestamptz
);
create index on slots (starts_at);

create table bookings (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique default encode(gen_random_bytes(16),'hex'), -- link pessoal
  slot_id       uuid not null references slots(id),
  client_name   text not null,
  client_phone  text not null,
  service_ids   text[] not null,
  total         numeric(10,2) not null,
  deposit       numeric(10,2) not null default 0,
  status        text not null default 'pending'
                check (status in ('pending','confirmed','cancelled','refunded','forfeited','done','no_show')),
  deposit_paid  boolean not null default false,
  payment_ref   text,                      -- id do pagamento no provedor
  created_at    timestamptz not null default now()
);
create index on bookings (slot_id);

create table owner (owner_email text primary key);   -- preencher com o e-mail de login da dona

-- ---------- Funções auxiliares ----------
create or replace function is_owner() returns boolean
language sql stable security definer as $$
  select auth.uid() is not null and auth.jwt() ->> 'email' = (select owner_email from owner limit 1);
$$;

-- ---------- RLS ----------
alter table services enable row level security;
alter table settings enable row level security;
alter table slots    enable row level security;
alter table bookings enable row level security;
alter table owner    enable row level security;

create policy services_read  on services for select using (active or is_owner());
create policy services_write on services for all using (is_owner()) with check (is_owner());
create policy settings_read  on settings for select using (true);
create policy settings_write on settings for update using (is_owner());

-- cliente enxerga só horários livres e futuros; a dona vê tudo
create policy slots_read  on slots for select using (
  is_owner() or (status = 'free' and starts_at > now())
);
create policy slots_write on slots for all using (is_owner()) with check (is_owner());

-- reservas: só a dona lê/escreve direto. A cliente usa as funções abaixo.
create policy bookings_owner on bookings for all using (is_owner()) with check (is_owner());

-- ---------- Funções públicas (cliente) ----------
-- Segura o horário e cria a reserva pendente. Devolve token e valor do sinal.
create or replace function create_booking(p_slot uuid, p_name text, p_phone text, p_services text[])
returns table(booking_id uuid, token text, total numeric, deposit numeric)
language plpgsql security definer as $$
declare
  s settings%rowtype; v_total numeric := 0; v_dep numeric := 0; sv services%rowtype; v_id uuid; v_tok text;
begin
  select * into s from settings;
  update slots set status = 'held', held_until = now() + make_interval(mins => s.hold_minutes)
   where id = p_slot and starts_at > now()
     and (status = 'free' or (status = 'held' and held_until < now()));
  if not found then raise exception 'slot_unavailable'; end if;

  for sv in select * from services where id = any(p_services) and active loop
    v_total := v_total + sv.price;
    v_dep   := v_dep + round(sv.price * coalesce(sv.deposit_pct, s.default_deposit_pct) / 100);
  end loop;
  if v_total = 0 then raise exception 'no_services'; end if;

  insert into bookings(slot_id, client_name, client_phone, service_ids, total, deposit, status)
  values (p_slot, p_name, p_phone, p_services, v_total, v_dep, case when v_dep = 0 then 'confirmed' else 'pending' end)
  returning id, bookings.token into v_id, v_tok;

  if v_dep = 0 then update slots set status = 'booked', held_until = null where id = p_slot; end if;
  return query select v_id, v_tok, v_total, v_dep;
end $$;

-- Consulta a reserva pelo link pessoal
create or replace function get_booking(p_token text)
returns table(id uuid, starts_at timestamptz, client_name text, service_ids text[], total numeric,
              deposit numeric, status text, can_free_change boolean)
language sql security definer as $$
  select b.id, sl.starts_at, b.client_name, b.service_ids, b.total, b.deposit, b.status,
         sl.starts_at - now() >= make_interval(hours => (select cancel_hours from settings))
  from bookings b join slots sl on sl.id = b.slot_id where b.token = p_token;
$$;

-- Cancelar: >= prazo devolve o sinal (status refunded), antes disso perde (forfeited)
create or replace function cancel_booking(p_token text)
returns text language plpgsql security definer as $$
declare b bookings%rowtype; st timestamptz; free boolean;
begin
  select * into b from bookings where token = p_token and status in ('pending','confirmed') for update;
  if not found then raise exception 'not_found'; end if;
  select starts_at into st from slots where id = b.slot_id;
  free := st - now() >= make_interval(hours => (select cancel_hours from settings));
  update slots set status = 'free', held_until = null where id = b.slot_id;
  update bookings set status = case when b.status = 'pending' then 'cancelled'
                                    when free then 'refunded' else 'forfeited' end
   where id = b.id;
  return case when b.status = 'pending' then 'cancelled' when free then 'refunded' else 'forfeited' end;
end $$;

-- Remarcar dentro do prazo: o sinal acompanha a reserva para o novo horário
create or replace function reschedule_booking(p_token text, p_new_slot uuid)
returns void language plpgsql security definer as $$
declare b bookings%rowtype; st timestamptz;
begin
  select * into b from bookings where token = p_token and status = 'confirmed' for update;
  if not found then raise exception 'not_found'; end if;
  select starts_at into st from slots where id = b.slot_id;
  if st - now() < make_interval(hours => (select cancel_hours from settings)) then
    raise exception 'too_late';   -- fora do prazo: cancelar (perde o sinal) e agendar de novo
  end if;
  update slots set status = 'booked' where id = p_new_slot and status = 'free' and starts_at > now();
  if not found then raise exception 'slot_unavailable'; end if;
  update slots set status = 'free' where id = b.slot_id;
  update bookings set slot_id = p_new_slot where id = b.id;
end $$;

-- Chamada pelo webhook de pagamento (service role) quando o Pix cai
create or replace function confirm_payment(p_booking uuid, p_ref text)
returns void language plpgsql security definer as $$
declare b bookings%rowtype;
begin
  select * into b from bookings where id = p_booking and status = 'pending' for update;
  if not found then return; end if;
  update bookings set status = 'confirmed', deposit_paid = true, payment_ref = p_ref where id = b.id;
  update slots set status = 'booked', held_until = null where id = b.slot_id;
end $$;

-- Libera horários cujo prazo de pagamento venceu (rodar a cada minuto com pg_cron)
create or replace function release_expired_holds() returns void
language sql security definer as $$
  update bookings set status = 'cancelled'
   where status = 'pending' and slot_id in (select id from slots where status = 'held' and held_until < now());
  update slots set status = 'free', held_until = null where status = 'held' and held_until < now();
$$;

grant execute on function create_booking(uuid,text,text,text[]) to anon;
grant execute on function get_booking(text) to anon;
grant execute on function cancel_booking(text) to anon;
grant execute on function reschedule_booking(text,uuid) to anon;
revoke execute on function confirm_payment(uuid,text) from anon, authenticated;
revoke execute on function release_expired_holds() from anon, authenticated;
