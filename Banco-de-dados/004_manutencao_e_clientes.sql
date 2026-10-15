-- Manutenção só para clientes + prazos (até 15 / mais de 15 dias) + tipo certo + conferência do nome.
-- Tudo é conferido dentro do banco, pelo WhatsApp da cliente, então não dá para burlar pela tela.
-- Rodar uma vez, depois do 003 (e do 005 e 006).

-- ---------- colunas e tabelas ----------
alter table services add column if not exists needs_history boolean not null default false;   -- só para quem já é cliente
alter table services add column if not exists family text;                 -- 'alongamento' ou 'gel' (vazio = serve para qualquer)
alter table services add column if not exists min_days int not null default 0;   -- vale só se passaram MAIS que X dias
alter table services add column if not exists max_days int;                      -- vale só até X dias (vazio = settings.maintenance_days)
alter table settings add column if not exists maintenance_days int not null default 30;

update services set needs_history = true where id in ('man15','man15m','gman15','gman15m');
update services set family = 'alongamento' where id in ('f1','fibra','man15','man15m');
update services set family = 'gel'         where id in ('gel','gman15','gman15m');
update services set min_days = 0,  max_days = 15   where id in ('man15','gman15');
update services set min_days = 15, max_days = null where id in ('man15m','gman15m');

-- Clientes cadastradas pela dona (clientes de antes do site, ou quem trocou de número)
create table if not exists known_clients (
  phone text primary key,        -- só números, com DDD
  name  text,
  last_visit date,               -- vazio = cliente fixa, liberada sempre
  family text                    -- 'alongamento' ou 'gel' (vazio = não sei)
);
alter table known_clients enable row level security;
drop policy if exists known_clients_owner on known_clients;
create policy known_clients_owner on known_clients for all using (is_owner()) with check (is_owner());
grant select, insert, update, delete on known_clients to authenticated;

-- ---------- funções de apoio ----------
create or replace function norm_phone(p text) returns text
language sql immutable as $$ select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 11) $$;

create or replace function first_name_norm(p text) returns text
language sql immutable as $$
  select translate(lower(split_part(trim(coalesce(p, '')), ' ', 1)),
                   'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
$$;

create or replace function client_name_matches(p_phone text, p_name text) returns boolean
language sql stable security definer as $$
  select exists (select 1 from known_clients k
                  where norm_phone(k.phone) = norm_phone(p_phone) and first_name_norm(k.name) = first_name_norm(p_name))
      or exists (select 1 from bookings b
                  where norm_phone(b.client_phone) = norm_phone(p_phone)
                    and b.status in ('confirmed', 'done') and first_name_norm(b.client_name) = first_name_norm(p_name));
$$;
revoke execute on function client_name_matches(text, text) from anon, authenticated;

create or replace function client_last_visit(p_phone text, p_at timestamptz)
returns table(visit_at timestamptz, family text)
language sql stable security definer as $$
  select v.visit_at, v.family from (
    select sl.starts_at as visit_at,
           (select sv.family from services sv where sv.id = any(b.service_ids) and sv.kind = 'principal' limit 1) as family
      from bookings b join slots sl on sl.id = b.slot_id
     where norm_phone(b.client_phone) = norm_phone(p_phone)
       and b.status in ('confirmed', 'done')
       and sl.starts_at < now() and sl.starts_at < p_at
       and exists (select 1 from services sv where sv.id = any(b.service_ids) and sv.kind = 'principal')
    union all
    select (k.last_visit + time '12:00') at time zone 'America/Sao_Paulo', k.family
      from known_clients k
     where norm_phone(k.phone) = norm_phone(p_phone) and k.last_visit is not null
       and (k.last_visit + time '12:00') at time zone 'America/Sao_Paulo' < p_at
  ) v order by v.visit_at desc limit 1;
$$;
revoke execute on function client_last_visit(text, timestamptz) from anon, authenticated;

create or replace function client_has_history(p_phone text, p_at timestamptz) returns boolean
language sql stable security definer as $$
  select exists (select 1 from known_clients k where norm_phone(k.phone) = norm_phone(p_phone) and k.last_visit is null)
      or exists (select 1 from client_last_visit(p_phone, p_at) lv
                  where p_at - lv.visit_at <= make_interval(days => (select maintenance_days from settings)));
$$;
revoke execute on function client_has_history(text, timestamptz) from anon, authenticated;

-- ---------- agendar (com todas as conferências) ----------
create or replace function create_booking(p_slot uuid, p_name text, p_phone text, p_services text[], p_note text default null)
returns table(booking_id uuid, token text, total numeric, deposit numeric, hold_until timestamptz)
language plpgsql security definer as $$
declare
  s settings%rowtype; v_total numeric := 0; v_dep numeric := 0; sv services%rowtype;
  v_id uuid; v_tok text; v_hold timestamptz; v_at timestamptz;
  lv record; v_diff interval; v_max interval; v_trusted boolean;
begin
  perform release_expired_holds();
  select * into s from settings;
  if length(trim(coalesce(p_name,''))) < 2 or length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) < 10 then
    raise exception 'invalid_data';
  end if;

  select starts_at into v_at from slots where id = p_slot;

  -- cliente cadastrada pela dona sem data de última visita: liberada sempre, sem conferir prazos
  select exists (select 1 from known_clients k where norm_phone(k.phone) = norm_phone(p_phone) and k.last_visit is null) into v_trusted;

  for sv in select * from services where id = any(p_services) and active and needs_history loop
    if client_has_history(p_phone, v_at) and not client_name_matches(p_phone, p_name) then
      raise exception 'maintenance_name_mismatch';
    end if;
    if v_trusted then continue; end if;
    if not client_has_history(p_phone, v_at) then raise exception 'maintenance_not_allowed'; end if;
    select * into lv from client_last_visit(p_phone, v_at);
    if lv.visit_at is not null then
      v_diff := v_at - lv.visit_at;
      v_max  := make_interval(days => coalesce(sv.max_days, s.maintenance_days));
      if v_diff > make_interval(days => s.maintenance_days) then raise exception 'maintenance_not_allowed'; end if;
      if sv.family is not null and lv.family is not null and sv.family <> lv.family then
        raise exception 'maintenance_wrong_type_%', lv.family;
      end if;
      if v_diff > v_max then raise exception 'maintenance_use_over15'; end if;
      if sv.min_days > 0 and v_diff <= make_interval(days => sv.min_days) then raise exception 'maintenance_use_under15'; end if;
    end if;
  end loop;

  v_hold := now() + make_interval(mins => s.hold_minutes);
  update slots set status = 'held', held_until = v_hold
   where id = p_slot and starts_at > now() and status = 'free';
  if not found then raise exception 'slot_unavailable'; end if;

  for sv in select * from services where id = any(p_services) and active loop
    v_total := v_total + sv.price;
    v_dep   := v_dep + round(sv.price * coalesce(sv.deposit_pct, s.default_deposit_pct) / 100);
  end loop;
  if v_total = 0 then raise exception 'no_services'; end if;

  insert into bookings(slot_id, client_name, client_phone, service_ids, total, deposit, status, note)
  values (p_slot, trim(p_name), p_phone, p_services, v_total, v_dep,
          case when v_dep = 0 then 'confirmed' else 'pending' end, nullif(trim(coalesce(p_note,'')), ''))
  returning bookings.id, bookings.token into v_id, v_tok;

  if v_dep = 0 then
    update slots set status = 'booked', held_until = null where id = p_slot;
    v_hold := null;
  end if;
  return query select v_id, v_tok, v_total, v_dep, v_hold;
end $$;

grant execute on function create_booking(uuid, text, text, text[], text) to anon;
