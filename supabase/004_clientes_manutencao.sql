-- Manutenção só para quem já é cliente: precisa ter feito um serviço principal confirmado,
-- com a data já passada, até X dias antes do novo horário (settings.maintenance_days, padrão 30).
-- Cada atendimento novo renova o prazo, então quem vem sempre continua liberada sozinha.
-- A conferência é feita pelo WhatsApp (últimos 11 dígitos), dentro do banco, e não pode ser burlada pela tela.

alter table services add column if not exists needs_history boolean not null default false;
update services set needs_history = true where id in ('man15','man15m','gman15','gman15m');

alter table settings add column if not exists maintenance_days int not null default 30;

-- Clientes de antes do site (opcional): quem estiver aqui também pode marcar manutenção.
create table if not exists known_clients (
  phone text primary key,        -- só números, com DDD (ex.: 11999998888)
  name  text
);
alter table known_clients enable row level security;
drop policy if exists known_clients_owner on known_clients;
create policy known_clients_owner on known_clients for all using (is_owner()) with check (is_owner());

create or replace function norm_phone(p text) returns text
language sql immutable as $$ select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 11) $$;

create or replace function client_has_history(p_phone text, p_at timestamptz) returns boolean
language sql stable security definer as $$
  select exists (select 1 from known_clients k where norm_phone(k.phone) = norm_phone(p_phone))
      or exists (
        select 1
          from bookings b join slots sl on sl.id = b.slot_id
         where norm_phone(b.client_phone) = norm_phone(p_phone)
           and b.status in ('confirmed', 'done')
           and sl.starts_at < now()
           and p_at - sl.starts_at <= make_interval(days => (select maintenance_days from settings))
           and exists (select 1 from services sv where sv.id = any(b.service_ids) and sv.kind = 'principal')
      );
$$;
revoke execute on function client_has_history(text, timestamptz) from anon, authenticated;

create or replace function create_booking(p_slot uuid, p_name text, p_phone text, p_services text[], p_note text default null)
returns table(booking_id uuid, token text, total numeric, deposit numeric, hold_until timestamptz)
language plpgsql security definer as $$
declare
  s settings%rowtype; v_total numeric := 0; v_dep numeric := 0; sv services%rowtype;
  v_id uuid; v_tok text; v_hold timestamptz; v_at timestamptz;
begin
  perform release_expired_holds();
  select * into s from settings;
  if length(trim(coalesce(p_name,''))) < 2 or length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) < 10 then
    raise exception 'invalid_data';
  end if;

  select starts_at into v_at from slots where id = p_slot;
  if exists (select 1 from services where id = any(p_services) and active and needs_history)
     and not client_has_history(p_phone, v_at) then
    raise exception 'maintenance_not_allowed';
  end if;

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
